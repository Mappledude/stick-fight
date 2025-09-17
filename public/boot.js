(function (global) {
  'use strict';

  if (!global || typeof global !== 'object') {
    return;
  }

  if (global.__StickFightBoot && typeof global.__StickFightBoot === 'object') {
    return;
  }

  const doc = typeof global.document !== 'undefined' ? global.document : null;

  const state = {
    flags: parseFlags(global.location ? global.location.search : ''),
    overlay: null,
    badge: null,
    statusList: null,
    errorBox: null,
    statuses: [],
    lastError: null,
    hideTimer: null,
    maxStatusEntries: 16,
    ready: false,
  };

  function parseBoolFlag(value) {
    if (typeof value !== 'string') {
      return false;
    }
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return false;
    }
    return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
  }

  function parseFlags(search) {
    if (typeof search !== 'string') {
      return { debug: false, safe: false, nofs: false, nolobby: false };
    }
    let params = null;
    try {
      params = new global.URLSearchParams(search);
    } catch (error) {
      params = null;
    }

    const read = (name, fallbackRegex) => {
      if (params) {
        const value = params.get(name);
        if (value !== null) {
          return parseBoolFlag(value);
        }
      }
      if (typeof fallbackRegex === 'string' && fallbackRegex) {
        try {
          const re = new RegExp(fallbackRegex, 'i');
          return re.test(search);
        } catch (error) {
          return false;
        }
      }
      return false;
    };

    return {
      debug: read('debug', '[?&]debug=(1|true|yes|on)\\b'),
      safe: read('safe', '[?&]safe=(1|true|yes|on)\\b'),
      nofs: read('nofs', '[?&]nofs=(1|true|yes|on)\\b'),
      nolobby: read('nolobby', '[?&]nolobby=(1|true|yes|on)\\b'),
    };
  }

  function ensureOverlay() {
    if (state.overlay || !doc) {
      return state.overlay;
    }
    const root = doc.getElementById('boot-overlay');
    if (!root) {
      return null;
    }
    state.overlay = root;
    state.badge = root.querySelector('[data-boot-badge]');
    state.statusList = root.querySelector('[data-boot-status]');
    state.errorBox = root.querySelector('[data-boot-error]');
    if (state.badge && typeof state.badge.textContent === 'string') {
      state.badge.textContent = 'Booting…';
    }
    if (state.overlay.hasAttribute('hidden')) {
      state.overlay.removeAttribute('hidden');
    }
    pushStatus('BOOT', 'overlay-ready');
    return state.overlay;
  }

  function formatTime(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
      return '';
    }
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    return hours + ':' + minutes + ':' + seconds;
  }

  function updateOverlay() {
    if (!ensureOverlay() || !state.statusList) {
      return;
    }
    const fragment = doc.createDocumentFragment();
    const start = Math.max(state.statuses.length - state.maxStatusEntries, 0);
    for (let i = start; i < state.statuses.length; i += 1) {
      const entry = state.statuses[i];
      if (!entry) {
        continue;
      }
      const item = doc.createElement('li');
      item.className = 'boot-overlay__status-item';
      item.setAttribute('data-boot-tag', entry.tag || 'BOOT');
      const label = doc.createElement('span');
      const time = entry.time ? doc.createElement('em') : null;
      if (time) {
        time.textContent = entry.time;
        item.appendChild(time);
      }
      label.textContent = entry.message;
      item.appendChild(label);
      fragment.appendChild(item);
    }
    state.statusList.textContent = '';
    state.statusList.appendChild(fragment);

    if (state.errorBox) {
      if (state.lastError) {
        state.errorBox.removeAttribute('hidden');
        state.errorBox.textContent = state.lastError;
      } else {
        state.errorBox.setAttribute('hidden', 'hidden');
        state.errorBox.textContent = '';
      }
    }
  }

  function pushStatus(tag, message, detail) {
    const timestamp = new Date();
    const text = typeof message === 'string' ? message : String(message);
    state.statuses.push({
      tag: tag || 'BOOT',
      message: text,
      detail: detail || null,
      time: formatTime(timestamp),
    });
    while (state.statuses.length > state.maxStatusEntries) {
      state.statuses.shift();
    }
    updateOverlay();
  }

  function logToConsole(tag, message, detail) {
    const label = '[' + tag + '] ' + message;
    if (typeof console === 'undefined' || !console) {
      return;
    }
    if (detail && typeof console.info === 'function') {
      console.info(label, detail);
      return;
    }
    if (typeof console.info === 'function') {
      console.info(label);
    } else if (typeof console.log === 'function') {
      console.log(label);
    }
  }

  function setBadge(text, options) {
    ensureOverlay();
    if (!state.badge) {
      return;
    }
    state.badge.textContent = text;
    if (options && options.color) {
      state.badge.style.background = options.color;
      state.badge.style.borderColor = options.borderColor || options.color;
    }
  }

  function setErrorBanner(errorText) {
    ensureOverlay();
    state.lastError = errorText || null;
    updateOverlay();
    if (state.badge) {
      state.badge.style.background = 'rgba(220, 53, 69, 0.4)';
      state.badge.style.borderColor = 'rgba(220, 53, 69, 0.75)';
      state.badge.textContent = 'Boot Failed';
    }
  }

  function hideOverlaySoon() {
    if (state.flags.debug) {
      return;
    }
    if (!ensureOverlay()) {
      return;
    }
    if (state.hideTimer) {
      clearTimeout(state.hideTimer);
    }
    state.hideTimer = global.setTimeout(() => {
      if (!state.overlay) {
        return;
      }
      state.overlay.setAttribute('hidden', 'hidden');
    }, 2500);
  }

  const boot = {
    version: 1,
    flags: state.flags,
    ensureOverlay,
    milestone(name, detail) {
      const label = typeof name === 'string' ? name : 'unknown';
      pushStatus('BOOT', label, detail || null);
      logToConsole('BOOT', label, detail);
      return this;
    },
    log(tag, message, detail) {
      const resolvedTag = typeof tag === 'string' ? tag : 'BOOT';
      const resolvedMessage = typeof message === 'string' ? message : String(message);
      pushStatus(resolvedTag, resolvedMessage, detail || null);
      logToConsole(resolvedTag, resolvedMessage, detail);
      return this;
    },
    guard(step, fn) {
      const label = typeof step === 'string' ? step : 'guarded-step';
      try {
        const result = typeof fn === 'function' ? fn() : undefined;
        return result;
      } catch (error) {
        const message = error && error.message ? error.message : String(error);
        pushStatus('ERROR', label + ' failed');
        logToConsole('ERROR', label + ' failed', error);
        setErrorBanner(label + '\n' + message);
        throw error;
      }
    },
    error(reason, context) {
      const prefix = context ? context + ': ' : '';
      const message = reason && reason.message ? reason.message : String(reason);
      pushStatus('ERROR', prefix + message);
      logToConsole('ERROR', prefix + message, reason);
      setErrorBanner(prefix + message);
    },
    ready(finalMessage) {
      state.ready = true;
      setBadge(typeof finalMessage === 'string' && finalMessage ? finalMessage : 'Ready', {
        color: 'rgba(40, 199, 111, 0.45)',
        borderColor: 'rgba(40, 199, 111, 0.75)',
      });
      hideOverlaySoon();
      return this;
    },
  };

  if (state.flags.debug) {
    boot.ensureOverlay();
    boot.log('BOOT', 'debug-flag=on');
  }
  if (state.flags.safe) {
    boot.ensureOverlay();
    boot.log('BOOT', 'safe-mode=on');
  }
  if (state.flags.nofs) {
    boot.ensureOverlay();
    boot.log('BOOT', 'fullscreen=disabled');
  }
  if (state.flags.nolobby) {
    boot.ensureOverlay();
    boot.log('BOOT', 'lobby=disabled');
  }

  global.__StickFightBoot = boot;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this);
