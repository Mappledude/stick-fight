import React, { useEffect, useRef, useState } from 'react';
import { CANVAS_H, CANVAS_W } from '../constants/room';
import MobileControls from './controls/MobileControls';
import { claimPlayer, ERR_DEVICE_MISMATCH, HeartbeatHandle } from '../net/playerClaim';
import { setLocalContext, clearLocalContext } from '../net/send';
import { startConsuming, stopConsuming } from '../net/consume';
import { getDeviceId, ensureAppAndUser } from '../lib/identity';
import { debugWarn } from '../lib/debug';
import { mountRoom, type RoomHandle } from '../net/room';

type RoomViewProps = {
  roomId: string;
  nick: string;
  children?: React.ReactNode;
};

type ClaimState = {
  uid: string;
  deviceId: string;
  heartbeat: HeartbeatHandle;
};

type ViewState = 'loading' | 'ready' | 'blocked' | 'error' | 'auth-error';

export default function RoomView({ roomId, nick, children }: RoomViewProps) {
  const [state, setState] = useState<ViewState>('loading');
  const [error, setError] = useState<Error | null>(null);
  const [authError, setAuthError] = useState<{ code?: string; message?: string } | null>(null);
  const [claim, setClaim] = useState<ClaimState | null>(null);
  const [signedInUid, setSignedInUid] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const roomHandleRef = useRef<RoomHandle | null>(null);
  const controlsReady = Boolean(claim && signedInUid && claim.uid === signedInUid);

  useEffect(() => {
    let cancelled = false;
    ensureAppAndUser()
      .then(({ user }) => {
        if (cancelled) {
          return;
        }
        setSignedInUid(user.uid);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        debugWarn('[INPUT][AUTH] ensureAppAndUser failed', error);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let heartbeat: HeartbeatHandle | null = null;

    setState('loading');
    setError(null);
    setClaim(null);
    setAuthError(null);

    claimPlayer(roomId, nick)
      .then((result) => {
        if (cancelled) {
          result.heartbeat.stop();
          return;
        }
        heartbeat = result.heartbeat;
        setClaim(result);
        setLocalContext(roomId, result.uid);
        startConsuming(roomId);
        setState('ready');
      })
      .catch((err: Error & { code?: string; uid?: string }) => {
        if (cancelled) {
          return;
        }
        if (err && (err.message === ERR_DEVICE_MISMATCH || err.code === ERR_DEVICE_MISMATCH)) {
          const deviceId = getDeviceId();
          const uid = err.uid || (err as any).uid || 'unknown';
          debugWarn(`[INPUT][BLOCK] device-mismatch uid=${uid} deviceId=${deviceId}`);
          setState('blocked');
        } else if (err && typeof err.code === 'string' && err.code.startsWith('auth/')) {
          const message =
            typeof err.message === 'string'
              ? err.message
              : err && typeof (err as any).message !== 'undefined'
                ? String((err as any).message)
                : String(err);
          setAuthError({ code: err.code, message });
          setState('auth-error');
        } else {
          setState('error');
          setError(err);
        }
      });

    return () => {
      cancelled = true;
      stopConsuming();
      clearLocalContext();
      if (heartbeat) {
        heartbeat.stop();
      }
      if (roomHandleRef.current) {
        void roomHandleRef.current.unmount();
        roomHandleRef.current = null;
      }
    };
  }, [roomId, nick]);

  useEffect(() => {
    const uid = claim?.uid;
    if (!controlsReady || !uid) {
      return undefined;
    }
    const canvas = canvasRef.current;
    if (!canvas) {
      debugWarn('[ROOM] room canvas is not available.');
      return undefined;
    }

    let cancelled = false;
    mountRoom({ roomCode: roomId, uid, canvas, name: nick })
      .then((handle) => {
        if (cancelled) {
          void handle.unmount();
          return;
        }
        roomHandleRef.current = handle;
      })
      .catch((error) => {
        if (!cancelled) {
          debugWarn('[ROOM] Failed to mount room', error);
        }
      });

    return () => {
      cancelled = true;
      if (roomHandleRef.current) {
        void roomHandleRef.current.unmount();
        roomHandleRef.current = null;
      }
    };
  }, [controlsReady, roomId, claim?.uid, nick]);

  if (state === 'loading') {
    return (
      <div className="room-view loading">
        <p>Joining room…</p>
      </div>
    );
  }

  if (state === 'blocked') {
    return (
      <div className="room-view blocked">
        <div className="modal">
          <h2>Device Claimed</h2>
          <p>This player is claimed on another device. Leave room or sign in on that device.</p>
        </div>
      </div>
    );
  }

  if (state === 'auth-error') {
    const code = authError?.code || 'auth/unknown';
    const message = authError?.message || 'Authentication failed. Please try again later.';
    return (
      <div className="room-view auth-error">
        <div
          className="error-banner"
          style={{
            backgroundColor: '#b00020',
            color: '#fff',
            padding: '12px 16px',
            borderRadius: '4px',
            margin: '24px auto',
            maxWidth: '420px',
            boxShadow: '0 2px 6px rgba(0, 0, 0, 0.2)',
          }}
        >
          <strong style={{ display: 'block', marginBottom: '8px' }}>Firebase authentication failed</strong>
          <div style={{ fontSize: '14px', lineHeight: 1.4 }}>
            <div>
              <span style={{ fontWeight: 600 }}>Code:</span> {code}
            </div>
            <div>
              <span style={{ fontWeight: 600 }}>Message:</span> {message}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="room-view error">
        <p>Failed to join room.</p>
        {error ? <pre>{String(error.message || error)}</pre> : null}
      </div>
    );
  }

  return (
    <div className="room-view ready">
      <section data-view="room" id="view-room">
        <div className="room-wrap">
          <canvas className="room-canvas" width={CANVAS_W} height={CANVAS_H} ref={canvasRef} />
          <div className="room-stage-line" />
        </div>
      </section>
      {children}
      {controlsReady ? <MobileControls /> : null}
    </div>
  );
}
