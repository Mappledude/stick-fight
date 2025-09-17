(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.StickFightJoyDiag = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const createDefaultJoyDiagModes = () => ({
    noControls: false,
    noJoystick: false,
    joystickOnly: false,
    joyTest: false,
  });

  const parseDebugFlag = (value) => {
    if (typeof value !== 'string') {
      return false;
    }
    const normalized = value.trim().toLowerCase();
    return (
      normalized === '1' ||
      normalized === 'true' ||
      normalized === 'yes' ||
      normalized === 'on'
    );
  };

  const parseJoyDiagConfig = (search) => {
    const modes = createDefaultJoyDiagModes();
    if (typeof search !== 'string' || search.length === 0) {
      return { enabled: false, modes };
    }

    const parseWithParams = () => {
      if (typeof URLSearchParams !== 'function') {
        return null;
      }
      try {
        const params = new URLSearchParams(search);
        const enabled = parseDebugFlag(params.get('joydiag'));
        if (!enabled) {
          return { enabled: false, modes };
        }
        modes.noControls = parseDebugFlag(params.get('nocontrols'));
        modes.noJoystick = parseDebugFlag(params.get('nojoystick'));
        modes.joystickOnly = parseDebugFlag(params.get('joyonly'));
        modes.joyTest = parseDebugFlag(params.get('joytest'));
        return { enabled: true, modes };
      } catch (error) {
        return null;
      }
    };

    const paramsResult = parseWithParams();
    if (paramsResult) {
      return paramsResult;
    }

    const lowerSearch = search.toLowerCase();
    const enabled = /[?&]joydiag=(1|true|yes|on)\b/.test(lowerSearch);
    if (!enabled) {
      return { enabled: false, modes };
    }

    modes.noControls = /[?&]nocontrols=(1|true|yes|on)\b/.test(lowerSearch);
    modes.noJoystick = /[?&]nojoystick=(1|true|yes|on)\b/.test(lowerSearch);
    modes.joystickOnly = /[?&]joyonly=(1|true|yes|on)\b/.test(lowerSearch);
    modes.joyTest = /[?&]joytest=(1|true|yes|on)\b/.test(lowerSearch);

    return { enabled: true, modes };
  };

  return {
    createDefaultJoyDiagModes,
    parseJoyDiagConfig,
  };
});
