import React, { useEffect, useState } from 'react';
import MobileControls from './controls/MobileControls';
import { claimPlayer, ERR_DEVICE_MISMATCH, HeartbeatHandle } from '../net/playerClaim';
import { setLocalContext, clearLocalContext } from '../net/send';
import { startConsuming, stopConsuming } from '../net/consume';
import { getDeviceId } from '../lib/identity';

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

type ViewState = 'loading' | 'ready' | 'blocked' | 'error';

export default function RoomView({ roomId, nick, children }: RoomViewProps) {
  const [state, setState] = useState<ViewState>('loading');
  const [error, setError] = useState<Error | null>(null);
  const [claim, setClaim] = useState<ClaimState | null>(null);

  useEffect(() => {
    let cancelled = false;
    let heartbeat: HeartbeatHandle | null = null;

    setState('loading');
    setError(null);
    setClaim(null);

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
          if (typeof console !== 'undefined' && console && typeof console.warn === 'function') {
            console.warn(`[INPUT][BLOCK] device-mismatch uid=${uid} deviceId=${deviceId}`);
          }
          setState('blocked');
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
    };
  }, [roomId, nick]);

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
      {children}
      {claim ? <MobileControls /> : null}
    </div>
  );
}
