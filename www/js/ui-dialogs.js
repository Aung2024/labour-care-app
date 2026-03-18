/**
 * AppDialog - lightweight in-app dialogs and toasts
 * Designed to look good on mobile and inside Capacitor Android.
 */
(function () {
  'use strict';

  function ensureBaseStyles() {
    if (document.getElementById('appDialogStyles')) return;
    const style = document.createElement('style');
    style.id = 'appDialogStyles';
    style.textContent = `
      .app-modal-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(15, 23, 42, 0.55);
        display: none;
        align-items: center;
        justify-content: center;
        z-index: 9999;
        padding: 1.25rem;
      }
      .app-modal {
        background: #fff;
        border-radius: 1rem;
        max-width: 420px;
        width: 100%;
        box-shadow: 0 15px 40px rgba(15, 23, 42, 0.4);
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      .app-modal-header {
        padding: 0.85rem 1.25rem;
        background: linear-gradient(135deg, #4f46e5, #0ea5e9);
        color: #fff;
        font-weight: 600;
        font-size: 0.95rem;
      }
      .app-modal-body {
        padding: 1.1rem 1.25rem 0.5rem;
        color: #111827;
        font-size: 0.95rem;
        line-height: 1.5;
      }
      .app-modal-body p { margin: 0; }
      .app-modal-footer {
        padding: 0.75rem 1.25rem 1.1rem;
        display: flex;
        justify-content: flex-end;
        gap: 0.5rem;
      }
      .app-modal-footer button {
        border: none;
        border-radius: 999px;
        padding: 0.4rem 1.3rem;
        font-size: 0.9rem;
        font-weight: 500;
        background: linear-gradient(135deg, #22c55e, #16a34a);
        color: #fff;
        box-shadow: 0 8px 20px rgba(22, 163, 74, 0.35);
      }
      .app-modal-footer button.app-btn-secondary {
        background: #e5e7eb;
        color: #111827;
        box-shadow: none;
      }
      .app-modal-footer button:active {
        transform: translateY(1px);
        box-shadow: 0 4px 12px rgba(22, 163, 74, 0.4);
      }
      @media (max-width: 480px) {
        .app-modal { max-width: 100%; }
        .app-modal-body { font-size: 0.9rem; }
      }
    `;
    document.head.appendChild(style);
  }

  function ensureAlertModal() {
    if (document.getElementById('appAlertModal')) return;
    ensureBaseStyles();

    const modal = document.createElement('div');
    modal.id = 'appAlertModal';
    modal.className = 'app-modal-backdrop';
    modal.innerHTML = `
      <div class="app-modal">
        <div class="app-modal-header">
          <span id="appAlertTitle">Notice</span>
        </div>
        <div class="app-modal-body">
          <p id="appAlertMessage"></p>
        </div>
        <div class="app-modal-footer">
          <button type="button" id="appAlertOkBtn">OK</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  async function alertDialog(message, options) {
    ensureAlertModal();

    return new Promise((resolve) => {
      const backdrop = document.getElementById('appAlertModal');
      const titleEl = document.getElementById('appAlertTitle');
      const msgEl = document.getElementById('appAlertMessage');
      const okBtn = document.getElementById('appAlertOkBtn');

      titleEl.textContent = (options && options.title) || 'Notice';
      msgEl.textContent = message || '';

      function close() {
        backdrop.style.display = 'none';
        okBtn.removeEventListener('click', onOk);
        backdrop.removeEventListener('click', onBackdrop);
        resolve();
      }

      function onOk(e) {
        e.preventDefault();
        close();
      }

      function onBackdrop(e) {
        if (e.target === backdrop) {
          close();
        }
      }

      okBtn.addEventListener('click', onOk);
      backdrop.addEventListener('click', onBackdrop);
      backdrop.style.display = 'flex';
    });
  }

  function ensureConfirmModal() {
    if (document.getElementById('appConfirmModal')) return;
    ensureBaseStyles();

    const modal = document.createElement('div');
    modal.id = 'appConfirmModal';
    modal.className = 'app-modal-backdrop';
    modal.innerHTML = `
      <div class="app-modal">
        <div class="app-modal-header">
          <span id="appConfirmTitle">Confirm</span>
        </div>
        <div class="app-modal-body">
          <p id="appConfirmMessage"></p>
        </div>
        <div class="app-modal-footer">
          <button type="button" class="app-btn-secondary" id="appConfirmCancelBtn">Cancel</button>
          <button type="button" id="appConfirmOkBtn">OK</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  async function confirmDialog(message, options) {
    ensureConfirmModal();

    return new Promise((resolve) => {
      const backdrop = document.getElementById('appConfirmModal');
      const titleEl = document.getElementById('appConfirmTitle');
      const msgEl = document.getElementById('appConfirmMessage');
      const okBtn = document.getElementById('appConfirmOkBtn');
      const cancelBtn = document.getElementById('appConfirmCancelBtn');

      titleEl.textContent = (options && options.title) || 'Confirm';
      msgEl.textContent = message || '';

      function close(result) {
        backdrop.style.display = 'none';
        okBtn.removeEventListener('click', onOk);
        cancelBtn.removeEventListener('click', onCancel);
        backdrop.removeEventListener('click', onBackdrop);
        resolve(result);
      }

      function onOk(e) {
        e.preventDefault();
        close(true);
      }

      function onCancel(e) {
        e.preventDefault();
        close(false);
      }

      function onBackdrop(e) {
        if (e.target === backdrop) {
          close(false);
        }
      }

      okBtn.addEventListener('click', onOk);
      cancelBtn.addEventListener('click', onCancel);
      backdrop.addEventListener('click', onBackdrop);
      backdrop.style.display = 'flex';
    });
  }

  window.AppDialog = {
    alert: alertDialog,
    confirm: confirmDialog
  };

  // Optional: soft-override window.alert to use our dialog where available
  const nativeAlert = window.alert ? window.alert.bind(window) : null;
  window.alert = function (msg) {
    try {
      alertDialog(String(msg));
    } catch (e) {
      if (nativeAlert) nativeAlert(msg);
    }
  };
})();

