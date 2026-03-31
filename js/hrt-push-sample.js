/**
 * Sample high-risk notification hooks (final rules TBD).
 * - Browser: Notification API when permitted.
 * - Capacitor: @capacitor/push-notifications + @capacitor/local-notifications when installed.
 */
(function (global) {
  function countHighRiskFromList(patients) {
    return (patients || []).filter(function (p) {
      return p.high_risk === 'yes' || p.high_risk === 'Yes' || p.high_risk === true;
    }).length;
  }

  async function sampleBrowserNotification(title, body) {
    if (!('Notification' in global) || Notification.permission !== 'granted') {
      return false;
    }
    try {
      new Notification(title, { body: body, tag: 'hrt-sample' });
      return true;
    } catch (e) {
      console.warn('HRT sample notification:', e);
      return false;
    }
  }

  async function sampleCapacitorLocalNotification(title, body) {
    try {
      if (!global.Capacitor || !global.Capacitor.Plugins) return false;
      const Local = global.Capacitor.Plugins.LocalNotifications;
      if (!Local || typeof Local.schedule !== 'function') return false;
      await Local.schedule({
        notifications: [
          {
            title: title,
            body: body,
            id: Math.floor(Date.now() % 1e8),
            schedule: { at: new Date(Date.now() + 1500) }
          }
        ]
      });
      return true;
    } catch (e) {
      console.warn('Capacitor local notification sample failed:', e);
      return false;
    }
  }

  /**
   * Call after patient list is loaded (online or mirror).
   */
  global.HRTPushSample = {
    maybeNotifyHighRiskCount: async function (patients) {
      const n = countHighRiskFromList(patients);
      const title = 'High-risk patients';
      const body = n === 0 ? 'No high-risk patients in current list.' : 'You have ' + n + ' high-risk patient(s) on your list (sample).';

      if (await sampleCapacitorLocalNotification(title, body)) {
        return;
      }
      await sampleBrowserNotification(title, body);
    },

    requestBrowserPermission: function () {
      if (!('Notification' in global)) {
        return Promise.resolve('unsupported');
      }
      if (Notification.permission === 'granted') {
        return Promise.resolve('granted');
      }
      return Notification.requestPermission();
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
