/**
 * Converts <select data-choice> into tap-friendly chips or stacked cards.
 * Keeps the native select (visually hidden) so existing save/load logic and Firestore values are unchanged.
 */
(function (global) {
  'use strict';

  var VALUE_DESCRIPTOR = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');

  function escapeValue(val) {
    if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(val);
    return String(val).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  function isPlaceholderOption(opt) {
    if (!opt || opt.value !== '') return false;
    var t = (opt.textContent || '').trim().toLowerCase();
    return !t || /^select\b/.test(t) || t.indexOf('select ') === 0;
  }

  function copyLangAttrs(from, to) {
    ['en', 'mm'].forEach(function (key) {
      var val = from.getAttribute('data-' + key);
      if (val != null) to.setAttribute('data-' + key, val);
    });
    if (from.classList.contains('lang-text') || from.getAttribute('data-en')) {
      to.classList.add('lang-text');
    }
  }

  function getAppLanguage() {
    return localStorage.getItem('appLanguage') || 'mm';
  }

  function getOptionLabel(opt) {
    var lang = getAppLanguage();
    if (lang === 'en' && opt.getAttribute('data-en')) return opt.getAttribute('data-en');
    if (lang === 'mm' && opt.getAttribute('data-mm')) return opt.getAttribute('data-mm');
    return (opt.textContent || '').trim();
  }

  function findOption(select, value) {
    return Array.from(select.options).find(function (opt) {
      return opt.value === value;
    });
  }

  function getRealOptions(select) {
    return Array.from(select.options).filter(function (opt) {
      return !isPlaceholderOption(opt);
    });
  }

  function applyChipDensity(select, group, layout) {
    if (layout !== 'chips') return;
    var density = select.dataset.choiceDensity;
    if (density) {
      group.classList.add('choice-chips--' + density);
      return;
    }
    var opts = getRealOptions(select);
    if (opts.length === 2) {
      var vals = opts.map(function (o) { return o.value.toLowerCase(); });
      if ((vals.indexOf('yes') >= 0 && vals.indexOf('no') >= 0) ||
          (vals.indexOf('given') >= 0 && vals.indexOf('not given') >= 0)) {
        group.classList.add('choice-chips--binary');
        return;
      }
    }
    if (opts.length === 3) {
      group.classList.add('choice-chips--cols-3');
      return;
    }
    if (opts.length >= 4) {
      group.classList.add('choice-chips--wrap');
    }
  }

  function applyCardLayout(select, group, layout) {
    if (layout !== 'cards') return;
    var cardLayout = select.dataset.choiceCards;
    if (cardLayout) {
      group.classList.add('choice-cards--' + cardLayout);
      return;
    }
    var count = getRealOptions(select).length;
    if (count === 2) {
      group.classList.add('choice-cards--pair');
    } else if (count >= 4) {
      group.classList.add('choice-cards--grid');
    }
  }

  function createChoiceButton(select, opt, layout) {
    var btn = document.createElement('button');
    btn.type = 'button';
    if (layout === 'cards') {
      btn.className = 'choice-card';
    } else if (layout === 'toggle') {
      btn.className = 'choice-toggle-btn';
    } else {
      btn.className = 'choice-chip';
    }
    btn.dataset.value = opt.value;
    btn.setAttribute('aria-pressed', 'false');

    if (layout === 'cards') {
      var label = document.createElement('span');
      label.className = 'choice-card__label lang-text';
      copyLangAttrs(opt, label);
      label.textContent = getOptionLabel(opt);
      btn.appendChild(label);
    } else {
      copyLangAttrs(opt, btn);
      btn.textContent = getOptionLabel(opt);
    }

    var dangerValues = (select.dataset.choiceDanger || '').split('|').filter(Boolean);
    if (dangerValues.indexOf(opt.value) >= 0) {
      btn.classList.add(layout === 'cards' ? 'choice-card--danger' : 'choice-chip--danger');
    }

    return btn;
  }

  function renderChoiceButtons(select, group, layout) {
    group.innerHTML = '';
    group.className = layout === 'cards' ? 'choice-cards' : (layout === 'toggle' ? 'choice-toggle' : 'choice-chips');
    Array.from(select.options).forEach(function (opt) {
      if (isPlaceholderOption(opt)) return;
      group.appendChild(createChoiceButton(select, opt, layout));
    });
    applyChipDensity(select, group, layout);
    applyCardLayout(select, group, layout);
    syncChoiceFromSelect(select);
  }

  function syncChoiceFromSelect(select) {
    var wrap = select.closest('.choice-control');
    if (!wrap) return;
    var val = select.value;
    wrap.querySelectorAll('.choice-chip, .choice-card, .choice-toggle-btn').forEach(function (btn) {
      var active = btn.dataset.value === val;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      btn.disabled = !!select.disabled;
      btn.classList.toggle('is-disabled', !!select.disabled);
      btn.setAttribute('aria-disabled', select.disabled ? 'true' : 'false');
    });
  }

  function hookSelectValueSetter(select) {
    if (select.__choiceHooked || !VALUE_DESCRIPTOR) return;
    select.__choiceHooked = true;
    Object.defineProperty(select, 'value', {
      get: function () {
        return VALUE_DESCRIPTOR.get.call(this);
      },
      set: function (v) {
        VALUE_DESCRIPTOR.set.call(this, v);
        syncChoiceFromSelect(this);
      },
      configurable: true
    });
  }

  function enhanceSelect(select) {
    if (select.dataset.choiceEnhanced === '1') return select;
    select.dataset.choiceEnhanced = '1';

    var layout = select.dataset.choiceLayout || 'chips';
    var wrap = document.createElement('div');
    wrap.className = 'choice-control choice-control--' + layout;
    if (select.dataset.choiceVariant) {
      wrap.classList.add('choice-control--' + select.dataset.choiceVariant);
    }

    select.parentNode.insertBefore(wrap, select);
    wrap.appendChild(select);
    if (select.style && select.style.cssText) {
      wrap.style.cssText = select.style.cssText;
      select.style.cssText = '';
    }
    select.classList.add('choice-select-hidden');
    select.setAttribute('aria-hidden', 'true');
    select.tabIndex = -1;

    var group = document.createElement('div');
    if (layout === 'cards') {
      group.className = 'choice-cards';
      group.setAttribute('role', 'group');
    } else if (layout === 'toggle') {
      group.className = 'choice-toggle';
      group.setAttribute('role', 'group');
    } else {
      group.className = 'choice-chips';
      group.setAttribute('role', 'group');
    }
    wrap.insertBefore(group, select);

    renderChoiceButtons(select, group, layout);

    group.addEventListener('click', function (e) {
      var btn = e.target.closest('.choice-chip, .choice-card, .choice-toggle-btn');
      if (!btn) return;
      if (select.disabled || btn.disabled) return;
      var newVal = btn.dataset.value;
      if (select.value === newVal) {
        select.value = '';
        select.dispatchEvent(new Event('change', { bubbles: true }));
        select.dispatchEvent(new Event('input', { bubbles: true }));
      } else {
        select.value = newVal;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        select.dispatchEvent(new Event('input', { bubbles: true }));
      }
      syncChoiceFromSelect(select);
    });

    hookSelectValueSetter(select);
    syncChoiceFromSelect(select);
    return select;
  }

  var ChoiceControls = {
    init: function (root) {
      (root || document).querySelectorAll('select[data-choice]').forEach(enhanceSelect);
    },
    refreshOptions: function (root) {
      var target = root || document;
      var selects = target.matches && target.matches('select[data-choice]')
        ? [target]
        : Array.from(target.querySelectorAll('select[data-choice]'));
      selects.forEach(function (select) {
        var enhanced = enhanceSelect(select);
        var wrap = enhanced.closest('.choice-control');
        var layout = enhanced.dataset.choiceLayout || 'chips';
        var group = wrap && wrap.querySelector('.choice-chips, .choice-cards, .choice-toggle');
        if (group) renderChoiceButtons(enhanced, group, layout);
      });
    },
    syncAll: function (root) {
      (root || document).querySelectorAll('select[data-choice-enhanced="1"]').forEach(syncChoiceFromSelect);
    },
    refreshLabels: function (root) {
      (root || document).querySelectorAll('select[data-choice-enhanced="1"]').forEach(function (select) {
        var wrap = select.closest('.choice-control');
        if (!wrap) return;
        wrap.querySelectorAll('.choice-chip, .choice-toggle-btn').forEach(function (btn) {
          var opt = findOption(select, btn.dataset.value);
          if (opt) btn.textContent = getOptionLabel(opt);
        });
        wrap.querySelectorAll('.choice-card').forEach(function (btn) {
          var opt = findOption(select, btn.dataset.value);
          var label = btn.querySelector('.choice-card__label');
          if (opt && label) label.textContent = getOptionLabel(opt);
        });
      });
    }
  };

  global.ChoiceControls = ChoiceControls;

  function boot() {
    ChoiceControls.init();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window);
