/**
 * Prevents duplicate form submissions from double-clicks on Save / Register buttons.
 * Use a stable key per form (e.g. 'patient-registration', 'anc-visit-save').
 */
(function (global) {
  const flights = Object.create(null);
  const buttonState = new WeakMap();

  function isLocked(key) {
    return !!flights[key];
  }

  function tryBegin(key) {
    if (flights[key]) return false;
    flights[key] = true;
    return true;
  }

  function lockButton(button, locked, options) {
    if (!button) return;
    const opts = options || {};
    if (locked) {
      if (!buttonState.has(button)) {
        buttonState.set(button, {
          html: button.innerHTML,
          disabled: button.disabled
        });
      }
      if (opts.loadingHtml != null) button.innerHTML = opts.loadingHtml;
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
    } else {
      const prev = buttonState.get(button);
      if (prev) {
        button.innerHTML = opts.restoreHtml != null ? opts.restoreHtml : prev.html;
        button.disabled = !!opts.keepDisabled;
        buttonState.delete(button);
      } else if (opts.restoreHtml != null) {
        button.innerHTML = opts.restoreHtml;
        button.disabled = !!opts.keepDisabled;
      } else {
        button.disabled = !!opts.keepDisabled;
      }
      button.removeAttribute('aria-busy');
    }
  }

  function end(key, button, options) {
    flights[key] = false;
    lockButton(button, false, options || {});
  }

  async function run(key, button, fn, options) {
    if (!tryBegin(key)) return { skipped: true };
    lockButton(button, true, options);
    try {
      const result = await fn();
      return { skipped: false, result: result };
    } finally {
      end(key, button, options);
    }
  }

  global.SubmitGuard = {
    isLocked: isLocked,
    tryBegin: tryBegin,
    end: end,
    lockButton: lockButton,
    run: run
  };
})(typeof window !== 'undefined' ? window : globalThis);
