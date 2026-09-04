/**
 * Non-blocking QI target reminders on clinical care forms.
 */
(function (global) {
  'use strict';

  function currentLanguage() {
    return localStorage.getItem('appLanguage') || localStorage.getItem('language') || 'mm';
  }

  function ensureStyles() {
    if (document.getElementById('qiTargetBannerStyles')) return;
    var style = document.createElement('style');
    style.id = 'qiTargetBannerStyles';
    style.textContent = [
      '.qi-target-banner{display:none;margin:0 0 1rem;padding:0.85rem 1rem;border-radius:12px;',
      'background:linear-gradient(135deg,#ecfeff,#f0fdfa);border:1px solid #99f6e4;color:#115e59;}',
      '.qi-target-banner.show{display:block;}',
      '.qi-target-banner strong{font-weight:800;}',
      '.qi-target-banner ul{margin:0.45rem 0 0;padding-left:1.1rem;}',
      '.qi-target-banner li{margin:0.2rem 0;font-size:0.9rem;font-weight:600;}',
      '.qi-target-highlight{outline:2px solid #14b8a6;outline-offset:2px;border-radius:8px;',
      'background:rgba(20,184,166,0.08);padding:0.25rem 0.35rem;}'
    ].join('');
    document.head.appendChild(style);
  }

  function findHighlightTarget(selectorOrId) {
    if (!selectorOrId) return null;
    var byId = document.getElementById(selectorOrId);
    if (byId) {
      var wrap = byId.closest('.form-check, .mb-3, .mb-4, .clinical-card, .form-section');
      return wrap || byId;
    }
    return document.getElementById(selectorOrId);
  }

  async function renderTargetBanner(options) {
    var opts = options || {};
    var sourceFilter = opts.source || null;
    var mountBefore = opts.mountBefore || null;
    if (!global.QualityImprovement || !global.QualityScoring || !firebase.auth) return;

    ensureStyles();
    var user = firebase.auth().currentUser;
    if (!user) return;

    var banner = document.getElementById('qiTargetBanner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'qiTargetBanner';
      banner.className = 'qi-target-banner';
      banner.setAttribute('role', 'status');
      banner.setAttribute('aria-live', 'polite');
      if (mountBefore && mountBefore.parentNode) {
        mountBefore.parentNode.insertBefore(banner, mountBefore);
      } else {
        var container = document.querySelector('.container') || document.body;
        container.insertBefore(banner, container.firstChild);
      }
    }

    try {
      var snapshot = await QualityImprovement.loadActiveTargetsForMidwife(user.uid);
      var matches = [];
      Object.keys(snapshot.targets || {}).forEach(function (indicatorId) {
        var entry = snapshot.targets[indicatorId];
        if (!entry || !entry.indicator) return;
        if (sourceFilter && entry.indicator.source !== sourceFilter) return;
        matches.push(entry);
      });
      if (!matches.length) {
        banner.classList.remove('show');
        banner.innerHTML = '';
        return;
      }

      var lang = currentLanguage();
      var title = lang === 'en'
        ? 'Quality Improvement targets for this month'
        : 'ဤလအတွက် အရည်အသွေး ပန်းတိုင်များ';
      var items = matches.map(function (entry) {
        var label = lang === 'en'
          ? (entry.indicator.shortEn || entry.indicator.en)
          : (entry.indicator.shortMm || entry.indicator.mm);
        var line = lang === 'en'
          ? ('This month’s ' + label + ' target: ' + entry.percent + '%')
          : ('ဤလ ' + label + ' ပန်းတိုင်: ' + entry.percent + '%');
        var highlight = findHighlightTarget(entry.indicator.formHighlight);
        if (highlight) highlight.classList.add('qi-target-highlight');
        return '<li>' + line + '</li>';
      }).join('');
      banner.innerHTML = '<strong><i class="fas fa-bullseye me-2"></i>' + title + '</strong><ul>' + items + '</ul>';
      banner.classList.add('show');
    } catch (error) {
      console.warn('QI target banner skipped:', error);
      banner.classList.remove('show');
    }
  }

  global.QualityTargetBanner = {
    render: renderTargetBanner
  };
})(typeof window !== 'undefined' ? window : this);
