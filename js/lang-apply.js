/**
 * Shared language auto-apply script.
 * Reads the stored language preference and applies translations
 * to all .lang-text elements on page load.
 * The only language switcher UI lives on home.html.
 */
(function () {
  window.noLanguageSwitcher = true;

  function applyLang(lang) {
    document.querySelectorAll('.lang-text').forEach(function (el) {
      var text = el.getAttribute('data-' + lang);
      if (text) el.textContent = text;
    });
  }

  var lang = localStorage.getItem('appLanguage') || 'mm';

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { applyLang(lang); });
  } else {
    applyLang(lang);
  }
})();
