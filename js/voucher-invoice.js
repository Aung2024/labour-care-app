(function (root) {
  'use strict';

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function text(value) {
    return value == null || value === '' ? '' : String(value);
  }

  function money(value, filled) {
    if (!filled && (value == null || value === '' || Number(value) === 0)) return '';
    if (value == null || value === '') return '';
    return Number(value).toLocaleString(undefined, { maximumFractionDigits: 0 });
  }

  function formatDate(value) {
    if (!value) return '';
    var date = value && typeof value.toDate === 'function' ? value.toDate() : new Date(value);
    if (Number.isNaN(date.getTime())) return text(value);
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
  }

  function formatDateTime(value) {
    if (!value) return '';
    var date = value && typeof value.toDate === 'function' ? value.toDate() : new Date(value);
    if (Number.isNaN(date.getTime())) return text(value);
    return date.toLocaleString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function mergeProject(voucher, extras) {
    var project = Object.assign({}, (extras && extras.project) || {});
    if (!project.name && voucher.poNameSnapshot) project.name = voucher.poNameSnapshot;
    if (!project.designation && voucher.poDesignationSnapshot) project.designation = voucher.poDesignationSnapshot;
    if (!project.date && voucher.verifiedAt) project.date = formatDate(voucher.verifiedAt);
    if (!project.paidAt && voucher.paidAt) project.paidAt = formatDateTime(voucher.paidAt);
    if (!project.paidName) {
      project.paidName = voucher.paidNameSnapshot || voucher.poNameSnapshot || project.name || '';
    }
    if (!project.paidDesignation) {
      project.paidDesignation = voucher.paidDesignationSnapshot || voucher.poDesignationSnapshot ||
        project.designation || '';
    }
    return project;
  }

  function appLink() {
    if (root.location && root.location.origin && /^https?:$/i.test(root.location.protocol || '')) {
      return root.location.origin;
    }
    return 'this application';
  }

  function renderFinance(data, project) {
    var status = String((data && data.status) || '').toLowerCase();
    if (status !== 'paid') return '';
    var paidWhen = text((project && project.paidAt) || formatDateTime(data && data.paidAt));
    var name = text((project && (project.paidName || project.name)) || '');
    if (!paidWhen && !name) return '';
    var issuedLine = name && paidWhen
      ? 'Issued By ' + escapeHtml(name) + ' and paid at ' + escapeHtml(paidWhen) + '.'
      : (name ? 'Issued By ' + escapeHtml(name) + '.' : 'Paid at ' + escapeHtml(paidWhen) + '.');
    return '<div class="invoice-finance invoice-auth-note">' +
      '<p class="invoice-auth-note__source">This invoice is generated from ' +
        escapeHtml(appLink()) + '</p>' +
      '<p class="invoice-auth-note__paid">' + issuedLine + '</p>' +
    '</div>';
  }

  function tests() {
    return (root.VoucherPricing && root.VoucherPricing.STANDARD_LAB_TESTS) || [];
  }

  function itemsById(model) {
    var map = {};
    (model.lineItems || model.tests || []).forEach(function (item) {
      var id = item.serviceId || item.id;
      if (id) map[id] = item;
    });
    return map;
  }

  function majorOf(item, minorKey, majorKey) {
    if (!item) return '';
    if (item[majorKey] != null) return item[majorKey];
    if (item[minorKey] != null) return Number(item[minorKey]) / 100;
    return '';
  }

  function selectedItems(model) {
    var byId = itemsById(model);
    var ids = model.selectedServiceIds || [];
    if (ids.length) {
      return ids.map(function (id, index) {
        var item = byId[id];
        var standard = tests().find(function (row) { return row.id === id; });
        return {
          index: index + 1,
          id: id,
          name: (item && (item.serviceName || item.name)) || (standard && standard.name) || id,
          item: item || null
        };
      });
    }
    return (model.lineItems || model.tests || []).map(function (item, index) {
      return {
        index: index + 1,
        id: item.serviceId || item.id,
        name: item.serviceName || item.name || '',
        item: item
      };
    });
  }

  function renderRows(model) {
    return selectedItems(model).map(function (row) {
      var item = row.item;
      var regular = money(majorOf(item, 'regularPriceMinor', 'regularPrice'), true);
      var labShare = money(majorOf(item, 'labCostShareMinor', 'labCostShare'), true);
      var client = money(majorOf(item, 'clientCopayMinor', 'clientCostShare'), true);
      var project = money(majorOf(item, 'projectContributionMinor', 'projectCostShare'), true);
      return '<tr>' +
        '<td class="inv-no">' + row.index + '</td>' +
        '<td class="inv-name">' + escapeHtml(row.name) + '</td>' +
        '<td class="inv-money">' + escapeHtml(regular) + '</td>' +
        '<td class="inv-money">' + escapeHtml(labShare) + '</td>' +
        '<td class="inv-money">' + escapeHtml(client) + '</td>' +
        '<td class="inv-money">' + escapeHtml(project) + '</td>' +
        '</tr>';
    }).join('');
  }

  function totalsRow(model) {
    var totals = model.totals || {};
    return '<tr class="inv-total">' +
      '<td colspan="2">Total (စုစုပေါင်း)</td>' +
      '<td class="inv-money">' + escapeHtml(money(majorOf(totals, 'regularPriceMinor', 'regularPrice'), true)) + '</td>' +
      '<td class="inv-money">' + escapeHtml(money(majorOf(totals, 'labCostShareMinor', 'labCostShare'), true)) + '</td>' +
      '<td class="inv-money">' + escapeHtml(money(majorOf(totals, 'clientCopayMinor', 'clientCopay'), true)) + '</td>' +
      '<td class="inv-money">' + escapeHtml(money(majorOf(totals, 'projectContributionMinor', 'projectContribution'), true)) + '</td>' +
      '</tr>';
  }

  function imageOrLine(src, label) {
    if (src) {
      return '<img class="inv-sign-img" src="' + escapeHtml(src) + '" alt="' + escapeHtml(label) + '">';
    }
    return '<span class="inv-line" aria-hidden="true"></span>';
  }

  function renderLabSeal(lab) {
    var data = lab || {};
    if (data.seal) {
      return '<img class="invoice-seal" src="' + escapeHtml(data.seal) + '" alt="Lab seal">';
    }
    var name = text(data.name || data.labName);
    var address = text(data.address);
    var phone = text(data.phone);
    if (!name && !address && !phone) {
      return '<div class="invoice-seal-box" aria-hidden="true"></div>';
    }
    return '<div class="invoice-seal-card" role="img" aria-label="Lab seal">' +
      (name ? '<div class="invoice-seal-card__name">' + escapeHtml(name) + '</div>' : '') +
      (address ? '<div class="invoice-seal-card__line">' + escapeHtml(address) + '</div>' : '') +
      (phone ? '<div class="invoice-seal-card__line">' + escapeHtml(phone) + '</div>' : '') +
      '</div>';
  }

  function render(container, model) {
    if (!container) throw new Error('Invoice container is required.');
    var data = model || {};
    var lab = data.lab || {};
    var project = data.project || {};
    var client = data.client || {};
    var status = String(data.status || '').toLowerCase();
    var rejected = status === 'rejected';
    var paid = status === 'paid';
    container.innerHTML =
      '<article class="invoice-sheet" id="invoiceSheet">' +
        (rejected ? '<div class="invoice-rejected">Rejected' + (data.rejectReason ? ': ' + escapeHtml(data.rejectReason) : '') + '</div>' : '') +
        (paid ? '<div class="invoice-paid-seal" aria-label="Paid">PAID</div>' : '') +
        '<div class="invoice-seal-row">' +
          '<div class="invoice-seal-left">' +
            renderLabSeal(lab) +
          '</div>' +
          '<div class="invoice-seal-right">' +
            '<div class="invoice-qr" aria-label="Voucher QR code"></div>' +
            '<div class="invoice-code-wrap"><span>Voucher Code :</span> <strong class="invoice-code">' +
              escapeHtml(text(data.voucherCode)) + '</strong></div>' +
            '<div class="invoice-issue-meta">' +
              '<div><span>Issued Date :</span> <strong>' +
                escapeHtml(text(data.issuedDate || formatDate(data.issuedAt))) + '</strong></div>' +
              '<div><span>Issued By :</span> <strong>' +
                escapeHtml(text(data.issuedBy)) + '</strong></div>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<h1 class="invoice-title">Invoice for Laboratory Charges</h1>' +
        '<div class="invoice-meta">' +
          '<div class="invoice-meta-left">' +
            '<div><span>Name of Patient :</span> <strong>' + escapeHtml(text(data.patientName)) + '</strong></div>' +
            '<div><span>Age :</span> <strong>' + escapeHtml(text(data.age)) + '</strong></div>' +
            '<div><span>Phone number :</span> <strong>' + escapeHtml(text(data.phone)) + '</strong></div>' +
          '</div>' +
          '<div class="invoice-meta-right">' +
            '<div><span>Redeemed date :</span> <strong>' +
              escapeHtml(text(data.redeemedDate || (lab && lab.date) || formatDate(data.redeemedAt))) +
              '</strong></div>' +
          '</div>' +
        '</div>' +
        '<table class="invoice-table">' +
          '<thead><tr>' +
            '<th>Sr No.</th><th>Laboratory Test</th>' +
            '<th>Regular Price (MMK)</th><th>Lab Cost share (MMK)</th>' +
            '<th>Client Co- payment (MMK)</th>' +
            '<th>Project Contribution/ Client Received Amount (MMK)</th>' +
          '</tr></thead>' +
          '<tbody>' + renderRows(data) + '</tbody>' +
          '<tfoot>' + totalsRow(data) + '</tfoot>' +
        '</table>' +
        '<div class="invoice-signs">' +
          '<section>' +
            '<h2>Prepared By (Lab):</h2>' +
            '<p>Cashier’s Signature ' + imageOrLine(lab.cashierSignature, 'Cashier signature') + '</p>' +
            '<p>Cashier\'s Name <strong>' + escapeHtml(text(lab.cashierName)) + '</strong></p>' +
            '<p>Date <strong>' + escapeHtml(text(lab.date)) + '</strong></p>' +
          '</section>' +
          '<section>' +
            '<h2>Payment Made By (Project):</h2>' +
            '<p>Signature ' + imageOrLine(project.signature, 'Project signature') + '</p>' +
            '<p>Name <strong>' + escapeHtml(text(project.name)) + '</strong></p>' +
            '<p>Designation <strong>' + escapeHtml(text(project.designation)) + '</strong></p>' +
            '<p>Date <strong>' + escapeHtml(text(project.date)) + '</strong></p>' +
          '</section>' +
          '<section>' +
            '<h2>Payment Received By (Client):</h2>' +
            '<p>Signature (လက်မှတ်) ' + imageOrLine(client.signature, 'Client signature') + '</p>' +
            '<p>Name (နာမည်) <strong>' + escapeHtml(text(client.name || data.patientName)) + '</strong></p>' +
            '<p>NRC No. (မှတ်ပုံတင်) <strong>' + escapeHtml(text(client.nrc || data.nrc)) + '</strong></p>' +
            '<p>Phone No. (ဖုန်းနံပါတ်) <strong>' + escapeHtml(text(client.phone || data.phone)) + '</strong></p>' +
            '<p>Address (လိပ်စာ) <strong>' + escapeHtml(text(client.address || data.address)) + '</strong></p>' +
            '<p>Date (ငွေလက်ခံသည့်ရက်စွဲ) <strong>' + escapeHtml(text(client.date)) + '</strong></p>' +
          '</section>' +
        '</div>' +
        renderFinance(data, project) +
      '</article>';

    var qrNode = container.querySelector('.invoice-qr');
    renderQr(qrNode, data.qrPayload, 88);
    return container.querySelector('.invoice-sheet');
  }

  function flattenQr(node, size) {
    if (!node) return;
    var width = size || 88;
    var canvas = node.querySelector('canvas');
    var existing = node.querySelector('img');
    var src = '';
    try {
      if (canvas && canvas.width) src = canvas.toDataURL('image/png');
    } catch (error) {}
    if (!src && existing && existing.src) src = existing.src;
    node.innerHTML = '';
    if (!src) return;
    var image = document.createElement('img');
    image.src = src;
    image.alt = node.getAttribute('aria-label') || 'QR';
    image.width = width;
    image.height = width;
    node.appendChild(image);
  }

  function renderQr(node, payload, size) {
    if (!node || !payload || typeof root.QRCode !== 'function') return;
    var width = size || 88;
    node.innerHTML = '';
    new root.QRCode(node, {
      text: payload,
      width: width,
      height: width,
      correctLevel: root.QRCode.CorrectLevel.M
    });
    flattenQr(node, width);
  }

  function waitForReady(element) {
    var images = Array.from((element || document).querySelectorAll('img'));
    return Promise.all(images.map(function (image) {
      if (image.complete && image.naturalWidth) return Promise.resolve();
      return new Promise(function (resolve) {
        image.addEventListener('load', resolve, { once: true });
        image.addEventListener('error', resolve, { once: true });
      });
    })).then(function () {
      return new Promise(function (resolve) { requestAnimationFrame(function () { resolve(); }); });
    });
  }

  function downloadPng(element, filename) {
    if (!element) throw new Error('Invoice sheet is required.');
    if (typeof root.html2canvas !== 'function') throw new Error('PNG export library is unavailable.');
    return waitForReady(element).then(function () {
      return root.html2canvas(element, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
        logging: false
      });
    }).then(function (canvas) {
      var link = document.createElement('a');
      link.download = filename || 'laboratory-invoice.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
    });
  }

  function cloneForPrint(element) {
    var clone = element.cloneNode(true);
    var sourceQrs = element.querySelectorAll('.invoice-qr');
    var destQrs = clone.querySelectorAll('.invoice-qr');
    Array.from(sourceQrs).forEach(function (source, index) {
      flattenQr(source, 88);
      var dest = destQrs[index];
      if (!dest) return;
      dest.innerHTML = '';
      var sourceImg = source.querySelector('img');
      if (!sourceImg) return;
      var image = document.createElement('img');
      image.src = sourceImg.src;
      image.alt = sourceImg.alt || 'QR';
      image.width = 88;
      image.height = 88;
      dest.appendChild(image);
    });
    return clone;
  }

  function printA4(elementOrElements) {
    var elements = Array.isArray(elementOrElements)
      ? elementOrElements.filter(Boolean)
      : (elementOrElements ? [elementOrElements] : []);
    if (!elements.length) throw new Error('Invoice sheet is required.');
    return Promise.all(elements.map(function (element) {
      return waitForReady(element);
    })).then(function () {
      var host = document.createElement('div');
      host.className = 'invoice-print-root';
      host.setAttribute('aria-hidden', 'true');
      elements.forEach(function (element, index) {
        var clone = cloneForPrint(element);
        if (index < elements.length - 1) {
          clone.style.pageBreakAfter = 'always';
          clone.style.breakAfter = 'page';
        }
        host.appendChild(clone);
      });
      document.body.appendChild(host);
      document.body.classList.add('invoice-printing');
      return new Promise(function (resolve, reject) {
        var cleaned = false;
        var cleanup = function () {
          if (cleaned) return;
          cleaned = true;
          document.body.classList.remove('invoice-printing');
          if (host.parentNode) host.parentNode.removeChild(host);
          window.removeEventListener('afterprint', cleanup);
          resolve();
        };
        window.addEventListener('afterprint', cleanup);
        try {
          window.focus();
          window.print();
        } catch (error) {
          cleanup();
          reject(error);
          return;
        }
        window.setTimeout(cleanup, 120000);
      });
    });
  }

  function compressImage(dataUrl, maxWidth, maxHeight, quality) {
    return new Promise(function (resolve, reject) {
      if (!dataUrl) {
        resolve('');
        return;
      }
      var image = new Image();
      image.onload = function () {
        var width = image.width;
        var height = image.height;
        var scale = Math.min((maxWidth || 320) / width, (maxHeight || 140) / height, 1);
        var canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(width * scale));
        canvas.height = Math.max(1, Math.round(height * scale));
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality == null ? 0.72 : quality));
      };
      image.onerror = function () { reject(new Error('Could not read the image.')); };
      image.src = dataUrl;
    });
  }

  function fileToDataUrl(file) {
    return new Promise(function (resolve, reject) {
      if (!file) {
        resolve('');
        return;
      }
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result || '')); };
      reader.onerror = function () { reject(new Error('Could not read the file.')); };
      reader.readAsDataURL(file);
    });
  }

  function bindSignaturePad(canvas) {
    if (!canvas) return { clear: function () {}, toDataUrl: function () { return ''; }, isEmpty: function () { return true; } };
    var ctx = canvas.getContext('2d');
    var drawing = false;
    var empty = true;
    function position(event) {
      var rect = canvas.getBoundingClientRect();
      var point = event.touches && event.touches[0] ? event.touches[0] : event;
      return { x: (point.clientX - rect.left) * (canvas.width / rect.width), y: (point.clientY - rect.top) * (canvas.height / rect.height) };
    }
    function start(event) {
      drawing = true;
      empty = false;
      var point = position(event);
      ctx.beginPath();
      ctx.moveTo(point.x, point.y);
      event.preventDefault();
    }
    function move(event) {
      if (!drawing) return;
      var point = position(event);
      ctx.lineTo(point.x, point.y);
      ctx.stroke();
      event.preventDefault();
    }
    function end() { drawing = false; }
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    canvas.addEventListener('pointerdown', start);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointerleave', end);
    canvas.addEventListener('touchstart', start, { passive: false });
    canvas.addEventListener('touchmove', move, { passive: false });
    canvas.addEventListener('touchend', end);
    return {
      clear: function () {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        empty = true;
      },
      toDataUrl: function () { return empty ? '' : canvas.toDataURL('image/png'); },
      isEmpty: function () { return empty; }
    };
  }

  function modelFromVoucher(voucher, extras) {
    var extra = extras || {};
    var totals = voucher.totals || {};
    return {
      status: voucher.status,
      rejectReason: voucher.rejectReason,
      patientName: voucher.patientNameSnapshot,
      age: voucher.patientAgeSnapshot,
      phone: voucher.patientPhoneSnapshot,
      nrc: voucher.patientNrcSnapshot,
      address: voucher.patientAddressSnapshot,
      voucherCode: voucher.code || voucher.id,
      date: formatDate(voucher.redeemedAt),
      issuedAt: voucher.issuedAt,
      issuedDate: formatDate(voucher.issuedAt) || text(voucher.ancVisitDate),
      issuedBy: voucher.issuerNameSnapshot || voucher.generatedByName || '',
      redeemedAt: voucher.redeemedAt,
      redeemedDate: (extra.lab && extra.lab.date) || formatDate(voucher.redeemedAt),
      qrPayload: voucher.qrPayload || (root.VoucherService ? root.VoucherService.buildQrPayload(voucher.code || voucher.id) : ''),
      selectedServiceIds: voucher.selectedServiceIds || [],
      lineItems: voucher.lineItems || voucher.tests || [],
      totals: {
        regularPriceMinor: totals.regularPriceMinor,
        labCostShareMinor: totals.labCostShareMinor,
        clientCopayMinor: totals.clientCopayMinor,
        projectContributionMinor: totals.projectContributionMinor
      },
      paidAt: voucher.paidAt,
      lab: extra.lab || {},
      project: mergeProject(voucher, extra),
      client: extra.client || {
        name: voucher.patientNameSnapshot,
        nrc: voucher.patientNrcSnapshot,
        phone: voucher.patientPhoneSnapshot,
        address: voucher.patientAddressSnapshot
      }
    };
  }

  root.VoucherInvoice = Object.freeze({
    render: render,
    waitForReady: waitForReady,
    downloadPng: downloadPng,
    printA4: printA4,
    compressImage: compressImage,
    fileToDataUrl: fileToDataUrl,
    bindSignaturePad: bindSignaturePad,
    modelFromVoucher: modelFromVoucher,
    formatDate: formatDate,
    formatDateTime: formatDateTime
  });
})(typeof window !== 'undefined' ? window : globalThis);
