/**
 * Multi-step form wizard: show one .wizard-step at a time inside a form.
 * Expects: form contains .form-wizard-bar with #...Prev, #...Next, #...Dots, #...StepTitle
 * Optional: each .wizard-step has data-en-title / data-mm-title for the bar label.
 */
(function () {
  'use strict';

  function getLang() {
    return localStorage.getItem('appLanguage') || 'mm';
  }

  function initWizard(config) {
    var form = document.getElementById(config.formId);
    if (!form) return;

    var steps = form.querySelectorAll('.wizard-step');
    if (!steps.length) return;

    var prevBtn = document.getElementById(config.prevId);
    var nextBtn = document.getElementById(config.nextId);
    var dotsEl = document.getElementById(config.dotsId);
    var titleEl = document.getElementById(config.titleId);
    var bar = document.getElementById(config.barId);

    if (!prevBtn || !nextBtn || !dotsEl) return;

    var current = 0;

    function showStep(index) {
      if (index < 0) index = 0;
      if (index >= steps.length) index = steps.length - 1;
      current = index;

      steps.forEach(function (el, i) {
        el.classList.toggle('wizard-step-active', i === current);
      });

      var dots = dotsEl.querySelectorAll('.form-wizard-dot');
      dots.forEach(function (d, i) {
        d.classList.toggle('active', i === current);
      });

      var lang = getLang();
      var stepEl = steps[current];
      var enT = stepEl.getAttribute('data-en-title') || '';
      var mmT = stepEl.getAttribute('data-mm-title') || '';
      if (titleEl) {
        var stepNum = current + 1;
        var total = steps.length;
        if (lang === 'mm' && mmT) {
          titleEl.textContent = 'အဆင့် ' + stepNum + '/' + total + ' — ' + mmT;
        } else if (enT) {
          titleEl.textContent = 'Step ' + stepNum + '/' + total + ' — ' + enT;
        } else {
          titleEl.textContent = (lang === 'mm' ? 'အဆင့် ' : 'Step ') + stepNum + '/' + total;
        }
      }

      prevBtn.style.visibility = current === 0 ? 'hidden' : 'visible';
      if (current >= steps.length - 1) {
        nextBtn.style.display = 'none';
        if (bar) bar.classList.add('wizard-on-last-step');
      } else {
        nextBtn.style.display = '';
        if (bar) bar.classList.remove('wizard-on-last-step');
      }
    }

    prevBtn.addEventListener('click', function () {
      showStep(current - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    nextBtn.addEventListener('click', function () {
      showStep(current + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    dotsEl.innerHTML = '';
    for (var i = 0; i < steps.length; i++) {
      var dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'form-wizard-dot' + (i === 0 ? ' active' : '');
      dot.setAttribute('aria-label', 'Step ' + (i + 1));
      (function (idx) {
        dot.addEventListener('click', function () {
          showStep(idx);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        });
      })(i);
      dotsEl.appendChild(dot);
    }

    showStep(0);

    document.addEventListener('FormWizardLanguageChanged', function () {
      showStep(current);
    });
  }

  function initDangerTileSync() {
    document.querySelectorAll('.danger-tile-input').forEach(function (inp) {
      var tile = inp.closest('.danger-tile');
      if (!tile) return;
      function sync() {
        tile.classList.toggle('danger-tile-selected', inp.checked);
      }
      inp.addEventListener('change', sync);
      sync();
    });
    document.querySelectorAll('.pregnancy-danger-grid .form-check-input').forEach(function (inp) {
      var row = inp.closest('.form-check');
      if (!row) return;
      function sync() {
        row.classList.toggle('pregnancy-danger-checked', inp.checked);
      }
      inp.addEventListener('change', sync);
      sync();
    });
    document.querySelectorAll('.pnc-danger-grid .form-check-input').forEach(function (inp) {
      var row = inp.closest('.form-check');
      if (!row) return;
      function sync() {
        row.classList.toggle('pnc-danger-checked', inp.checked);
      }
      inp.addEventListener('change', sync);
      sync();
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    initDangerTileSync();
    initWizard({
      formId: 'ancForm',
      barId: 'ancFormWizardBar',
      prevId: 'ancWizardPrev',
      nextId: 'ancWizardNext',
      dotsId: 'ancWizardDots',
      titleId: 'ancWizardStepTitle',
    });
    initWizard({
      formId: 'postpartumForm',
      barId: 'pncFormWizardBar',
      prevId: 'pncWizardPrev',
      nextId: 'pncWizardNext',
      dotsId: 'pncWizardDots',
      titleId: 'pncWizardStepTitle',
    });
    initWizard({
      formId: 'immediateCareForm',
      barId: 'nbFormWizardBar',
      prevId: 'nbWizardPrev',
      nextId: 'nbWizardNext',
      dotsId: 'nbWizardDots',
      titleId: 'nbWizardStepTitle',
    });
  });
})();
