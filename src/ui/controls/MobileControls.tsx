import React, { useEffect, useRef } from 'react';
import { getDeviceId, ensureSignedInUser } from '../../lib/identity';
import { sendMove, sendPunch, sendKick } from '../../net/send';

import './controls.css';

const DEADZONE = 0.12;
const REPEAT_MS = 110; // ~9Hz

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

function normalizeAxis(dx: number, dy: number, radius: number) {
  if (radius <= 0) {
    return { ax: 0, ay: 0, mag: 0 };
  }
  const rawAx = clamp(dx / radius, -1, 1);
  const rawAy = clamp(dy / radius, -1, 1);
  const magnitude = Math.min(Math.hypot(rawAx, rawAy), 1);
  if (magnitude < DEADZONE) {
    return { ax: 0, ay: 0, mag: 0 };
  }
  const scaledMag = (magnitude - DEADZONE) / (1 - DEADZONE);
  const scale = magnitude === 0 ? 0 : scaledMag / magnitude;
  return {
    ax: clamp(rawAx * scale, -1, 1),
    ay: clamp(rawAy * scale, -1, 1),
    mag: clamp(scaledMag, 0, 1),
  };
}

function vibrate(ms = 12) {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(ms);
    }
  } catch (error) {
    // ignore vibration errors
  }
}

function isDesktop(): boolean {
  if (typeof navigator === 'undefined') {
    return false;
  }
  const ua = navigator.userAgent || '';
  const lower = ua.toLowerCase();
  if (/android|iphone|ipad|ipod/.test(lower)) {
    return false;
  }
  return /macintosh|mac os x|windows|linux/.test(lower);
}

type PointerState = {
  pointerId: number | null;
};

type RepeatHandle = {
  start: () => void;
  stop: () => void;
};

function createRepeater(callback: () => void): RepeatHandle {
  let timer: ReturnType<typeof setInterval> | null = null;
  const start = () => {
    if (timer) {
      return;
    }
    callback();
    timer = setInterval(callback, REPEAT_MS);
  };
  const stop = () => {
    if (!timer) {
      return;
    }
    clearInterval(timer);
    timer = null;
  };
  return { start, stop };
}

const MobileControls: React.FC = () => {
  const knobRef = useRef<HTMLDivElement>(null);
  const joystickRef = useRef<HTMLDivElement>(null);
  const pointerStateRef = useRef<PointerState>({ pointerId: null });
  const frameRequest = useRef<number | null>(null);
  const pendingAxis = useRef<{ ax: number; ay: number; mag: number }>({ ax: 0, ay: 0, mag: 0 });
  const punchRef = useRef<HTMLButtonElement>(null);
  const kickRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let cancelled = false;
    ensureSignedInUser()
      .then(({ user }) => {
        if (cancelled) {
          return;
        }
        const deviceId = getDeviceId();
        const width = typeof window !== 'undefined' ? window.innerWidth : 0;
        const height = typeof window !== 'undefined' ? window.innerHeight : 0;
        if (typeof console !== 'undefined' && console && typeof console.log === 'function') {
          console.log(`[INPUT] controls-mounted uid=${user.uid} deviceId=${deviceId} vw=${width}x${height}`);
        }
      })
      .catch((error) => {
        if (typeof console !== 'undefined' && console && typeof console.error === 'function') {
          console.error('[INPUT] controls-mounted failed', error);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const joystick = joystickRef.current;
    const knob = knobRef.current;
    if (!joystick || !knob) {
      return;
    }

    const state = pointerStateRef.current;

    const renderAxis = () => {
      frameRequest.current = null;
      const { ax, ay, mag } = pendingAxis.current;
      knob.style.transform = `translate(calc(${50 + ax * 40}% - 50%), calc(${50 + ay * 40}% - 50%))`;
      sendMove({ ax, ay, mag }).catch((error) => {
        if (typeof console !== 'undefined' && console && typeof console.error === 'function') {
          console.error('[INPUT] sendMove failed', error);
        }
      });
    };

    const scheduleRender = () => {
      if (frameRequest.current !== null) {
        return;
      }
      frameRequest.current = requestAnimationFrame(renderAxis);
    };

    const resetAxis = () => {
      pendingAxis.current = { ax: 0, ay: 0, mag: 0 };
      scheduleRender();
    };

    const onPointerDown = (event: PointerEvent) => {
      if (state.pointerId !== null) {
        return;
      }
      event.preventDefault();
      joystick.setPointerCapture(event.pointerId);
      state.pointerId = event.pointerId;
      const { width } = joystick.getBoundingClientRect();
      const axis = normalizeAxis(0, 0, width / 2);
      pendingAxis.current = axis;
      scheduleRender();
    };

    const onPointerMove = (event: PointerEvent) => {
      if (state.pointerId !== event.pointerId) {
        return;
      }
      event.preventDefault();
      const rect = joystick.getBoundingClientRect();
      const radius = Math.min(rect.width, rect.height) / 2;
      const dx = event.clientX - (rect.left + rect.width / 2);
      const dy = event.clientY - (rect.top + rect.height / 2);
      pendingAxis.current = normalizeAxis(dx, dy, radius);
      scheduleRender();
    };

    const onPointerUp = (event: PointerEvent) => {
      if (state.pointerId !== event.pointerId) {
        return;
      }
      event.preventDefault();
      joystick.releasePointerCapture(event.pointerId);
      state.pointerId = null;
      resetAxis();
    };

    const onPointerCancel = (event: PointerEvent) => {
      if (state.pointerId !== event.pointerId) {
        return;
      }
      event.preventDefault();
      joystick.releasePointerCapture(event.pointerId);
      state.pointerId = null;
      resetAxis();
    };

    joystick.addEventListener('pointerdown', onPointerDown);
    joystick.addEventListener('pointermove', onPointerMove, { passive: false });
    joystick.addEventListener('pointerup', onPointerUp);
    joystick.addEventListener('pointercancel', onPointerCancel);

    const pause = () => {
      if (state.pointerId !== null) {
        state.pointerId = null;
      }
      resetAxis();
    };

    window.addEventListener('blur', pause);
    window.addEventListener('visibilitychange', pause);

    return () => {
      joystick.removeEventListener('pointerdown', onPointerDown);
      joystick.removeEventListener('pointermove', onPointerMove);
      joystick.removeEventListener('pointerup', onPointerUp);
      joystick.removeEventListener('pointercancel', onPointerCancel);
      window.removeEventListener('blur', pause);
      window.removeEventListener('visibilitychange', pause);
      if (frameRequest.current !== null) {
        cancelAnimationFrame(frameRequest.current);
        frameRequest.current = null;
      }
      resetAxis();
    };
  }, []);

  useEffect(() => {
    const punchRepeater = createRepeater(() => {
      vibrate(12);
      sendPunch().catch((error) => {
        if (typeof console !== 'undefined' && console && typeof console.error === 'function') {
          console.error('[INPUT] sendPunch failed', error);
        }
      });
    });
    const kickRepeater = createRepeater(() => {
      vibrate(12);
      sendKick().catch((error) => {
        if (typeof console !== 'undefined' && console && typeof console.error === 'function') {
          console.error('[INPUT] sendKick failed', error);
        }
      });
    });

    const punchButton = punchRef.current;
    const kickButton = kickRef.current;
    if (!punchButton || !kickButton) {
      return;
    }

    const attachButton = (element: HTMLElement, repeater: RepeatHandle) => {
      const onPointerDown = (event: PointerEvent) => {
        event.preventDefault();
        element.setPointerCapture(event.pointerId);
        repeater.start();
      };
      const onPointerUp = (event: PointerEvent) => {
        element.releasePointerCapture(event.pointerId);
        repeater.stop();
      };
      const onPointerCancel = (event: PointerEvent) => {
        element.releasePointerCapture(event.pointerId);
        repeater.stop();
      };
      element.addEventListener('pointerdown', onPointerDown);
      element.addEventListener('pointerup', onPointerUp);
      element.addEventListener('pointercancel', onPointerCancel);
      element.addEventListener('pointerleave', onPointerCancel);
      return () => {
        element.removeEventListener('pointerdown', onPointerDown);
        element.removeEventListener('pointerup', onPointerUp);
        element.removeEventListener('pointercancel', onPointerCancel);
        element.removeEventListener('pointerleave', onPointerCancel);
        repeater.stop();
      };
    };

    const cleanupPunch = attachButton(punchButton, punchRepeater);
    const cleanupKick = attachButton(kickButton, kickRepeater);

    return () => {
      cleanupPunch();
      cleanupKick();
    };
  }, []);

  useEffect(() => {
    if (!isDesktop()) {
      return;
    }

    const keyState: Record<string, boolean> = {};

    const applyKeyboardAxis = () => {
      const ax = (keyState['ArrowRight'] || keyState['KeyD'] ? 1 : 0) - (keyState['ArrowLeft'] || keyState['KeyA'] ? 1 : 0);
      const ay = (keyState['ArrowDown'] || keyState['KeyS'] ? 1 : 0) - (keyState['ArrowUp'] || keyState['KeyW'] ? 1 : 0);
      const normalized = normalizeAxis(ax, ay, 1);
      pendingAxis.current = normalized;
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => {
          sendMove(normalized).catch(() => undefined);
        });
      }
    };

    const punchRepeater = createRepeater(() => {
      vibrate(12);
      sendPunch().catch(() => undefined);
    });
    const kickRepeater = createRepeater(() => {
      vibrate(12);
      sendKick().catch(() => undefined);
    });

    const onKeyDown = (event: KeyboardEvent) => {
      keyState[event.code] = true;
      if (event.code === 'KeyJ') {
        event.preventDefault();
        punchRepeater.start();
      } else if (event.code === 'KeyK') {
        event.preventDefault();
        kickRepeater.start();
      } else if (event.code.startsWith('Arrow') || event.code === 'KeyW' || event.code === 'KeyA' || event.code === 'KeyS' || event.code === 'KeyD') {
        event.preventDefault();
        applyKeyboardAxis();
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      keyState[event.code] = false;
      if (event.code === 'KeyJ') {
        punchRepeater.stop();
      } else if (event.code === 'KeyK') {
        kickRepeater.stop();
      } else if (event.code.startsWith('Arrow') || event.code === 'KeyW' || event.code === 'KeyA' || event.code === 'KeyS' || event.code === 'KeyD') {
        applyKeyboardAxis();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      punchRepeater.stop();
      kickRepeater.stop();
    };
  }, []);

  return (
    <div className="controls-root">
      <div id="joystick" className="joy-wrap" ref={joystickRef}>
        <div className="joy-knob" ref={knobRef} />
      </div>
      <div className="btn-wrap">
        <button id="btn-punch" className="btn action" type="button" ref={punchRef}>Punch</button>
        <button id="btn-kick" className="btn alt" type="button" ref={kickRef}>Kick</button>
      </div>
    </div>
  );
};

export default MobileControls;
