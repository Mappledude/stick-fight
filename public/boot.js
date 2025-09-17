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
    debugDrawer: null,
    debugToggle: null,
    debugTextarea: null,
    debugCopyButton: null,
    debugEntries: [],
    lastError: null,
    hideTimer: null,
    maxStatusEntries: 16,
    maxDebugEntries: 200,
    drawerVisible: false,
    shortcutsBound: false,
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

  function ensureDebugDrawer() {
    if (state.debugDrawer || !doc) {
      return state.debugDrawer;
    }

    const drawer = doc.createElement('section');
    drawer.id = 'boot-debug-drawer';
    drawer.setAttribute('data-open', 'false');

    const header = doc.createElement('div');
    header.className = 'boot-debug-drawer__header';

    const toggle = doc.createElement('button');
    toggle.type = 'button';
    toggle.className = 'boot-debug-drawer__toggle';
    toggle.textContent = 'Debug Logs';
    toggle.setAttribute('aria-expanded', 'false');
    header.appendChild(toggle);

    const copy = doc.createElement('button');
    copy.type = 'button';
    copy.className = 'boot-debug-drawer__copy';
    copy.textContent = 'Copy Logs';
    copy.setAttribute('title', 'Copy debug logs to clipboard');
    header.appendChild(copy);

    const body = doc.createElement('div');
    body.className = 'boot-debug-drawer__body';

    const textarea = doc.createElement('textarea');
    textarea.id = 'debug-copy';
    textarea.setAttribute('readonly', 'readonly');
    textarea.className = 'boot-debug-drawer__textarea';
    body.appendChild(textarea);

    drawer.appendChild(header);
    drawer.appendChild(body);

    doc.body.appendChild(drawer);

    const toggleDrawer = () => {
      setDebugDrawerVisibility(!state.drawerVisible);
    };

    toggle.addEventListener('click', (event) => {
      event.preventDefault();
      toggleDrawer();
    });

    copy.addEventListener('click', (event) => {
      event.preventDefault();
      copyDebugLogs();
    });

    state.debugDrawer = drawer;
    state.debugToggle = toggle;
    state.debugCopyButton = copy;
    state.debugTextarea = textarea;

    bindShortcuts();
    updateDebugDrawer();

    return state.debugDrawer;
  }

  function bindShortcuts() {
    if (state.shortcutsBound || !doc) {
      return;
    }
    doc.addEventListener('keydown', (event) => {
      if (!event || event.defaultPrevented) {
        return;
      }
      const key = event.key || '';
      const isToggleKey = key.toLowerCase() === 'c';
      if (!isToggleKey || !event.shiftKey || !(event.ctrlKey || event.metaKey)) {
        return;
      }
      ensureDebugDrawer();
      setDebugDrawerVisibility(!state.drawerVisible);
      event.preventDefault();
      event.stopPropagation();
    });
    state.shortcutsBound = true;
  }

  function updateDebugDrawer() {
    if (!ensureDebugDrawer() || !state.debugTextarea) {
      return;
    }
    const previousScrollTop = state.debugTextarea.scrollTop;
    const atBottom =
      state.debugTextarea.scrollHeight - (state.debugTextarea.clientHeight + state.debugTextarea.scrollTop) <= 4;
    state.debugTextarea.value = state.debugEntries.join('\n');
    if (atBottom) {
      state.debugTextarea.scrollTop = state.debugTextarea.scrollHeight;
    } else {
      state.debugTextarea.scrollTop = previousScrollTop;
    }
  }

  function setDebugDrawerVisibility(visible) {
    ensureDebugDrawer();
    state.drawerVisible = Boolean(visible);
    if (!state.debugDrawer) {
      return;
    }
    state.debugDrawer.setAttribute('data-open', state.drawerVisible ? 'true' : 'false');
    if (state.drawerVisible) {
      state.debugDrawer.classList.add('is-open');
    } else {
      state.debugDrawer.classList.remove('is-open');
    }
    if (state.debugToggle) {
      state.debugToggle.setAttribute('aria-expanded', state.drawerVisible ? 'true' : 'false');
    }
  }

  function copyDebugLogs() {
    ensureDebugDrawer();
    if (!state.debugTextarea) {
      return;
    }
    const text = state.debugTextarea.value || '';
    if (!text) {
      return;
    }
    const clipboard = global.navigator && global.navigator.clipboard;
    if (clipboard && typeof clipboard.writeText === 'function') {
      clipboard.writeText(text).catch(() => {
        fallbackCopy(state.debugTextarea);
      });
      return;
    }
    fallbackCopy(state.debugTextarea);
  }

  function fallbackCopy(textarea) {
    if (!textarea || typeof textarea.select !== 'function') {
      return;
    }
    const active = doc && doc.activeElement;
    const selection = {
      start: typeof textarea.selectionStart === 'number' ? textarea.selectionStart : null,
      end: typeof textarea.selectionEnd === 'number' ? textarea.selectionEnd : null,
    };
    textarea.focus();
    textarea.select();
    try {
      if (doc && typeof doc.execCommand === 'function') {
        doc.execCommand('copy');
      }
    } catch (error) {
      /* noop */
    }
    if (typeof textarea.setSelectionRange === 'function') {
      const start = selection.start === null ? textarea.value.length : selection.start;
      const end = selection.end === null ? start : selection.end;
      textarea.setSelectionRange(start, end);
    }
    if (active && typeof active.focus === 'function' && active !== textarea) {
      active.focus();
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
    appendDebugEntry(tag || 'BOOT', text, detail, timestamp);
    updateOverlay();
  }

  function appendDebugEntry(tag, message, detail, timestamp) {
    const parts = [];
    if (timestamp && typeof timestamp.toISOString === 'function') {
      parts.push('[' + timestamp.toISOString() + ']');
    }
    parts.push('[' + tag + ']');
    parts.push(message);
    if (typeof detail !== 'undefined' && detail !== null) {
      let rendered = '';
      if (typeof detail === 'string') {
        rendered = detail;
      } else {
        try {
          rendered = JSON.stringify(detail);
        } catch (error) {
          rendered = String(detail);
        }
      }
      if (rendered) {
        parts.push('—', rendered);
      }
    }
    state.debugEntries.push(parts.join(' '));
    while (state.debugEntries.length > state.maxDebugEntries) {
      state.debugEntries.shift();
    }
    updateDebugDrawer();
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
