import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getAuth, onAuthStateChanged } from 'firebase/auth';

import { CANVAS_H, CANVAS_W } from '../constants/room';
import { startRenderer } from '../net/renderRoom';
import {
  enterRoom,
  leaveRoom,
  spawnOnStage,
  type EnterRoomHandle,
} from '../net/presence';
import { watchPlayers, type PlayerPresence as Player } from '../net/playersStore';
import { attachControls } from '../net/controls';
import { setLocalContext, clearLocalContext } from '../net/send';
import { startConsuming, stopConsuming } from '../net/consume';
import MobileControls from '../ui/controls/MobileControls';

const LOCAL_PLACEHOLDER_UID = 'local-temp';

type RouteParams = {
  code?: string;
};

export default function RoomView(): JSX.Element {
  const { code: roomCodeParam } = useParams<RouteParams>();
  const roomCode = typeof roomCodeParam === 'string' ? roomCodeParam : '';
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const playersRef = useRef<Map<string, Player>>(new Map());
  const [selfUid, setSelfUid] = useState<string>(LOCAL_PLACEHOLDER_UID);

  const initialPlayer = useMemo<Player>(() => {
    const spawn = spawnOnStage();
    return {
      uid: LOCAL_PLACEHOLDER_UID,
      name: 'You',
      color: '#37A9FF',
      x: spawn.x,
      y: spawn.y,
      dir: spawn.dir,
    };
  }, [roomCode]);

  const selfPlayerRef = useRef<Player>(initialPlayer);

  // Reset local state when the room changes.
  useEffect(() => {
    const map = playersRef.current;
    map.clear();
    let nextPlayer = initialPlayer;
    let nextUid = LOCAL_PLACEHOLDER_UID;
    const authUser = getAuth().currentUser;
    if (authUser && typeof authUser.uid === 'string' && authUser.uid.trim()) {
      nextUid = authUser.uid;
      nextPlayer = { ...initialPlayer, uid: nextUid };
    }
    map.set(nextUid, nextPlayer);
    selfPlayerRef.current = nextPlayer;
    setSelfUid(nextUid);

    return () => {
      map.clear();
    };
  }, [initialPlayer, roomCode]);

  // Track auth state so we can swap the provisional UID for the real one.
  useEffect(() => {
    const auth = getAuth();
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user || !user.uid) {
        setSelfUid((prevUid) => {
          if (prevUid === LOCAL_PLACEHOLDER_UID) {
            return prevUid;
          }
          const map = playersRef.current;
          const existing = map.get(prevUid) || selfPlayerRef.current;
          const fallback: Player = {
            ...(existing || selfPlayerRef.current),
            uid: LOCAL_PLACEHOLDER_UID,
          };
          map.delete(prevUid);
          map.set(LOCAL_PLACEHOLDER_UID, fallback);
          selfPlayerRef.current = fallback;
          return LOCAL_PLACEHOLDER_UID;
        });
        return;
      }

      setSelfUid((prevUid) => {
        if (prevUid === user.uid) {
          return prevUid;
        }
        const map = playersRef.current;
        const existing = map.get(prevUid) || selfPlayerRef.current;
        const preserved: Player = {
          ...(existing || selfPlayerRef.current),
          uid: user.uid,
        };
        if (prevUid && map.has(prevUid)) {
          map.delete(prevUid);
        }
        map.set(user.uid, preserved);
        selfPlayerRef.current = preserved;
        return user.uid;
      });
    });
    return () => {
      unsubscribe();
    };
  }, []);

  // Start rendering as soon as the canvas is ready.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const stopRenderer = startRenderer({
      canvas,
      getPlayers: () => playersRef.current,
      selfUid,
    });
    return () => {
      stopRenderer();
    };
  }, [selfUid, roomCode]);

  // Sync presence with Firestore (best effort) once we have a real UID.
  useEffect(() => {
    if (!roomCode || !selfUid || selfUid === LOCAL_PLACEHOLDER_UID) {
      return () => undefined;
    }

    const map = playersRef.current;
    let presenceHandle: EnterRoomHandle | null = null;
    let unsubscribe: (() => void) | null = null;
    let detachControls: (() => void) | null = null;
    let cancelled = false;

    setLocalContext(roomCode, selfUid);
    startConsuming(roomCode);

    const getPlayer = (uid: string) => map.get(uid);
    const setLocalPos = ({ x, y, dir }: { x: number; y: number; dir: 'L' | 'R' }) => {
      const existing = map.get(selfUid) || selfPlayerRef.current;
      const next: Player = {
        ...(existing || selfPlayerRef.current),
        uid: selfUid,
        x,
        y,
        dir,
      };
      map.set(selfUid, next);
      selfPlayerRef.current = next;
    };

    (async () => {
      try {
        presenceHandle = await enterRoom(roomCode, selfUid, {
          name: selfPlayerRef.current.name,
          color: selfPlayerRef.current.color,
        });
        if (cancelled) {
          await leaveRoom(roomCode, selfUid, presenceHandle);
          presenceHandle = null;
          return;
        }
        const { payload } = presenceHandle;
        const existing = map.get(selfUid) || selfPlayerRef.current;
        const merged: Player = {
          ...(existing || selfPlayerRef.current),
          ...payload,
          uid: selfUid,
          x: existing?.x ?? payload.x,
          y: existing?.y ?? payload.y,
          dir: existing?.dir ?? payload.dir,
          color: existing?.color ?? payload.color,
          name: existing?.name ?? payload.name,
        };
        map.set(selfUid, merged);
        selfPlayerRef.current = merged;
      } catch (error) {
        if (typeof console !== 'undefined' && console && typeof console.warn === 'function') {
          console.warn('[room] enterRoom failed (continuing with local player)', error);
        }
      }

      try {
        unsubscribe = watchPlayers(roomCode, selfUid, (remoteMap) => {
          const localSelf = selfPlayerRef.current;
          remoteMap.forEach((value, key) => {
            if (key === selfUid) {
              const merged: Player = {
                ...value,
                uid: selfUid,
                x: localSelf?.x ?? value.x,
                y: localSelf?.y ?? value.y,
                dir: localSelf?.dir ?? value.dir,
                color: localSelf?.color ?? value.color,
                name: localSelf?.name ?? value.name,
              };
              map.set(selfUid, merged);
              selfPlayerRef.current = merged;
            } else {
              map.set(key, value);
            }
          });

          if (!remoteMap.has(selfUid) && localSelf) {
            map.set(selfUid, localSelf);
          }

          Array.from(map.keys()).forEach((key) => {
            if (key !== selfUid && !remoteMap.has(key)) {
              map.delete(key);
            }
          });
        });
      } catch (error) {
        if (typeof console !== 'undefined' && console && typeof console.warn === 'function') {
          console.warn('[room] watchPlayers failed (showing local state only)', error);
        }
      }

      try {
        detachControls = attachControls({ roomCode, uid: selfUid, getPlayer, setLocalPos });
      } catch (error) {
        if (typeof console !== 'undefined' && console && typeof console.warn === 'function') {
          console.warn('[room] attachControls failed', error);
        }
      }
    })();

    return () => {
      cancelled = true;
      detachControls?.();
      unsubscribe?.();
      stopConsuming();
      clearLocalContext();
      if (presenceHandle) {
        void leaveRoom(roomCode, selfUid, presenceHandle)
          .catch(() => undefined)
          .finally(() => {
            presenceHandle = null;
          });
      }
    };
  }, [roomCode, selfUid]);

  const controlsReady = selfUid !== LOCAL_PLACEHOLDER_UID;

  return (
    <div className="room-view ready">
      <section data-view="room" id="view-room">
        <div className="room-wrap">
          <canvas className="room-canvas" width={CANVAS_W} height={CANVAS_H} ref={canvasRef} />
          <div className="room-stage-line" />
        </div>
      </section>
      {controlsReady ? <MobileControls /> : null}
    </div>
  );
}
