/**
 * Shared ENG/MM language toggle for forms and reports using .lang-text elements.
 */
(function (global) {
  'use strict';

  var currentLanguage = localStorage.getItem('appLanguage') || 'mm';

  function applyClinicalRiskLanguage(showEnglish) {
    global.document.querySelectorAll('.risk-mm').forEach(function (el) {
      el.style.display = showEnglish ? 'none' : 'block';
    });
    global.document.querySelectorAll('.risk-en').forEach(function (el) {
      el.style.display = showEnglish ? 'block' : 'none';
    });
  }

  function switchLanguage(lang) {
    currentLanguage = lang;
    localStorage.setItem('appLanguage', lang);
    global.document.querySelectorAll('.language-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.lang === lang);
    });
    global.document.querySelectorAll('.lang-text').forEach(function (el) {
      var text = el.dataset[lang] || el.dataset.en || el.textContent;
      if (text != null) el.textContent = text;
    });
    global.document.querySelectorAll('option[data-en], option[data-mm]').forEach(function (el) {
      var optText = el.dataset[lang] || el.dataset.en || el.textContent;
      if (optText != null) el.textContent = optText;
    });
    applyClinicalRiskLanguage(lang === 'en');
    if (typeof global.onAppLanguageChange === 'function') {
      global.onAppLanguageChange(lang);
    }
  }

  function initLanguageSwitcher() {
    global.document.querySelectorAll('.language-btn[data-lang]').forEach(function (btn) {
      if (btn.dataset.langBound === '1') return;
      btn.dataset.langBound = '1';
      btn.addEventListener('click', function () {
        switchLanguage(btn.dataset.lang);
      });
    });
    switchLanguage(currentLanguage);
  }

  global.currentLanguage = currentLanguage;
  global.switchLanguage = switchLanguage;
  global.initLanguageSwitcher = initLanguageSwitcher;

  if (global.document.readyState === 'loading') {
    global.document.addEventListener('DOMContentLoaded', initLanguageSwitcher);
  } else {
    initLanguageSwitcher();
  }
})(typeof window !== 'undefined' ? window : this);
