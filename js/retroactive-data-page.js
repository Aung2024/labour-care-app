/**
 * Midwife Back Fill page controller.
 */
(function (global) {
  'use strict';

  var state = {
    user: null,
    mothers: [],
    scans: new Map(),
    bundles: new Map(),
    cursor: 0,
    activeId: null,
    templates: {},
    saving: false,
    booted: false
  };
  var PAGE = 8;

  function lang() {
    return global.currentLanguage === 'en' ? 'en' : 'mm';
  }

  function t(en, mm) {
    return lang() === 'en' ? en : mm;
  }

  function label(item) {
    if (!item) return '';
    return lang() === 'en' ? (item.labelEn || item.en || '') : (item.labelMm || item.mm || item.labelEn || '');
  }

  function optionLabel(option) {
    return lang() === 'en' ? option.en : option.mm;
  }

  function show(id, visible) {
    var el = document.getElementById(id);
    if (el) el.hidden = !visible;
  }

  function setMessage(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text || '';
  }

  async function boot() {
    if (state.booted) return;
    show('bootState', false);
    if (global.navigator && global.navigator.onLine === false) {
      show('offlineState', true);
      show('workState', false);
      return;
    }
    state.booted = true;
    var user = global.firebase.auth().currentUser;
    if (!user) return;
    var profile = await global.firebase.firestore().collection('users').doc(user.uid).get();
    var data = profile.exists ? profile.data() || {} : {};
    var role = String(data.role || '').toLowerCase();
    if (role !== 'midwife') {
      show('bootState', false);
      show('deniedState', true);
      show('workState', false);
      return;
    }
    state.user = { uid: user.uid, email: user.email || '', role: data.role || 'Midwife' };
    show('workState', true);
    try {
      await loadQueue(true);
    } catch (error) {
      console.error(error);
      state.booted = false;
      setMessage('statusText', t('Could not load your patients. Check the connection and try again.', 'လူနာများကို မဖွင့်နိုင်ပါ။ အင်တာနက်စစ်ပြီး ထပ်ကြိုးစားပါ။'));
    }
  }

  async function loadQueue(reset) {
    if (reset) {
      state.cursor = 0;
      state.scans = new Map();
      state.mothers = [];
      setMessage('statusText', t('Finding your patients…', 'လူနာများကို ရှာနေသည်…'));
      state.mothers = await global.RetroactiveDataService.listOwnedMothers(global.firebase.firestore(), state.user.uid);
    }
    await scanMore();
  }

  async function scanMore() {
    var next = state.mothers.slice(state.cursor, state.cursor + PAGE);
    state.cursor += next.length;
    show('loadingState', true);
    var db = global.firebase.firestore();
    for (var i = 0; i < next.length; i++) {
      try {
        var bundle = await global.RetroactiveDataService.loadBundle(db, next[i]);
        state.bundles.set(next[i].id, bundle);
        state.scans.set(next[i].id, global.RetroactiveDataRules.scanPatient(bundle));
        renderList();
      } catch (error) {
        console.error(error);
        setMessage('statusText', t('Some patients could not be checked. Try again.', 'လူနာအချို့ကို စစ်မရပါ။ ထပ်ကြိုးစားပါ။'));
      }
    }
    show('loadingState', false);
    renderList();
  }

  function filteredScans() {
    var query = (document.getElementById('patientSearch').value || '').trim().toLowerCase();
    var rows = [];
    if (query) {
      state.mothers.forEach(function (mother) {
        var haystack = (String(mother.name || '') + ' ' + mother.id).toLowerCase();
        if (haystack.indexOf(query) === -1) return;
        rows.push(state.scans.get(mother.id) || {
          patientId: mother.id,
          patientName: mother.name || '',
          age: mother.age == null ? '' : mother.age,
          gapCount: null,
          pending: true
        });
      });
    } else {
      state.scans.forEach(function (scan) { if (scan.gapCount) rows.push(scan); });
    }
    rows.sort(function (a, b) { return String(a.patientName).localeCompare(String(b.patientName)); });
    return rows;
  }

  function renderList() {
    var list = document.getElementById('patientList');
    var rows = filteredScans();
    var scanned = state.scans.size;
    var remaining = Math.max(0, state.mothers.length - state.cursor);
    setMessage('statusText', t(
      scanned + ' checked · ' + rows.length + ' need data',
      scanned + ' ဦး စစ်ပြီး · ' + rows.length + ' ဦး ဒေတာလိုသေးသည်'
    ));
    show('loadMoreBtn', remaining > 0);
    list.textContent = '';
    if (!rows.length && !remaining) {
      var empty = document.createElement('p');
      empty.className = 'empty-copy';
      empty.textContent = t('No missing data found in the patients checked so far.', 'ယခုစစ်ထားသော လူနာများတွင် ပြန်ဖြည့်ရန် လိုအပ်ချက် မတွေ့ပါ။');
      list.appendChild(empty);
      return;
    }
    rows.forEach(function (scan) { list.appendChild(patientButton(scan)); });
  }

  function patientButton(scan) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'patient-row';
    var name = document.createElement('strong');
    name.textContent = scan.patientName || t('Unnamed patient', 'အမည်မရှိ');
    var meta = document.createElement('span');
    meta.textContent = scan.pending
      ? t('Not checked yet', 'မစစ်ရသေး')
      : (t(scan.gapCount + ' items', scan.gapCount + ' ချက်') + (scan.age !== '' ? ' · ' + scan.age : ''));
    button.appendChild(name);
    button.appendChild(meta);
    button.addEventListener('click', function () { openPatient(scan.patientId); });
    return button;
  }

  async function openPatient(patientId) {
    state.activeId = patientId;
    state.templates = {};
    show('listView', false);
    show('detailView', true);
    if (!state.bundles.get(patientId)) {
      document.getElementById('detailName').textContent = t('Checking patient…', 'လူနာကို စစ်နေသည်…');
      document.getElementById('detailBody').textContent = '';
      try {
        var mother = state.mothers.find(function (item) { return item.id === patientId; });
        var bundle = await global.RetroactiveDataService.loadBundle(global.firebase.firestore(), mother);
        state.bundles.set(patientId, bundle);
        state.scans.set(patientId, global.RetroactiveDataRules.scanPatient(bundle));
      } catch (error) {
        console.error(error);
        document.getElementById('detailName').textContent = t('Could not check this patient.', 'ဤလူနာကို မစစ်နိုင်ပါ။');
        return;
      }
    }
    renderDetail();
  }

  function renderDetail() {
    var scan = state.scans.get(state.activeId);
    var bundle = state.bundles.get(state.activeId);
    var host = document.getElementById('detailBody');
    host.textContent = '';
    if (!scan || !bundle) return;
    document.getElementById('detailName').textContent = scan.patientName || t('Patient', 'လူနာ');
    document.getElementById('detailMeta').textContent = t(scan.gapCount + ' items to complete', scan.gapCount + ' ချက် ဖြည့်ရန်');
    if (scan.truncated) {
      var note = document.createElement('p');
      note.className = 'warn-copy';
      note.textContent = t('This patient has a very large record. The oldest rows may not be shown yet.', 'ဤလူနာတွင် မှတ်တမ်းအလွန်များနေ၍ အဟောင်းများကို အကုန်မပြနိုင်ပါ။');
      host.appendChild(note);
    }
    scan.modules.forEach(function (mod) {
      if (!mod.records.length && !mod.canAdd) return;
      host.appendChild(moduleBlock(mod, bundle));
    });
    host.querySelectorAll('input, select, textarea, button').forEach(function (el) {
      el.addEventListener('change', updateReviewCount);
      el.addEventListener('input', updateReviewCount);
    });
    updateReviewCount();
  }

  function moduleBlock(mod, bundle) {
    var section = document.createElement('section');
    section.className = 'module-card';
    var title = document.createElement('h2');
    title.textContent = label(mod);
    section.appendChild(title);
    mod.records.forEach(function (record) {
      section.appendChild(recordCard(record));
    });
    if (mod.canAdd) {
      var add = document.createElement('button');
      add.type = 'button';
      add.className = 'secondary-btn';
      add.textContent = t('Add historical record', 'ယခင်မှတ်တမ်း ထည့်ရန်');
      add.addEventListener('click', function () {
        state.templates[mod.id] = global.RetroactiveDataRules.createTemplate(mod.id, bundle);
        renderDetail();
      });
      section.appendChild(add);
      if (state.templates[mod.id]) section.appendChild(templateCard(state.templates[mod.id]));
    }
    return section;
  }

  function recordCard(record) {
    var card = document.createElement('article');
    card.className = 'record-card';
    card.dataset.recordKey = record.key;
    var heading = document.createElement('div');
    heading.className = 'record-head';
    var toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.checked = true;
    toggle.dataset.recordToggle = record.key;
    toggle.setAttribute('aria-label', label(record));
    var name = document.createElement('h3');
    name.textContent = label(record);
    heading.appendChild(toggle);
    heading.appendChild(name);
    card.appendChild(heading);
    record.gaps.forEach(function (gap) { card.appendChild(gapEditor(gap, record)); });
    (record.optional || []).forEach(function (gap) { card.appendChild(gapEditor(gap, record)); });
    return card;
  }

  function templateCard(template) {
    var record = {
      key: template.module + ':template',
      module: template.module,
      recordId: null,
      create: true,
      visitNumber: template.visitNumber,
      labelEn: 'New historical record',
      labelMm: 'ယခင်မှတ်တမ်းအသစ်',
      gaps: [{
        id: template.module + ':template:create',
        field: '*',
        kind: 'absent',
        editor: { type: 'group', fields: template.fields }
      }]
    };
    return recordCard(record);
  }

  function gapEditor(gap, record) {
    var wrap = document.createElement('div');
    wrap.className = 'gap-field';
    wrap.dataset.gapId = gap.id;
    wrap.dataset.module = record.module;
    wrap.dataset.recordId = record.recordId || '';
    wrap.dataset.create = record.create ? '1' : '0';
    wrap.dataset.field = gap.field || '';
    if (record.visitNumber) wrap.dataset.visitNumber = String(record.visitNumber);
    if (gap.kind === 'conflict') {
      var conflict = document.createElement('p');
      conflict.className = 'conflict-copy';
      conflict.textContent = t('Current: ', 'လက်ရှိ: ') + displayValue(gap.currentValue) + t(' · Previous: ', ' · ယခင်: ') + displayValue(gap.legacyValue);
      wrap.appendChild(conflict);
    }
    if (gap.babyField) {
      wrap.dataset.babyIndex = String(gap.babyIndex || 0);
      wrap.dataset.babyField = gap.babyField;
    }
    if (gap.editor && gap.editor.type === 'group') {
      gap.editor.fields.forEach(function (field) {
        var block = document.createElement('div');
        block.className = 'group-field';
        var caption = document.createElement('label');
        caption.textContent = label(field);
        block.appendChild(caption);
        block.appendChild(controlFor(field, gap.id + ':' + field.key));
        wrap.appendChild(block);
      });
      return wrap;
    }
    var title = document.createElement('label');
    title.textContent = label(gap);
    title.htmlFor = 'field-' + gap.id;
    wrap.appendChild(title);
    wrap.appendChild(controlFor(gap, 'field-' + gap.id));
    return wrap;
  }

  function displayValue(value) {
    if (value == null || value === '') return t('blank', 'ဗလာ');
    if (typeof value === 'boolean') return value ? t('Yes', 'ရှိ') : t('No', 'မရှိ');
    return String(value);
  }

  function controlFor(field, id) {
    var editor = field.editor || field;
    var type = editor.type;
    var input;
    if (type === 'select' || type === 'boolean') {
      input = document.createElement('select');
      input.id = id;
      if (type === 'boolean') input.dataset.valueKind = 'boolean';
      var blank = document.createElement('option');
      blank.value = '';
      blank.textContent = t('Select', 'ရွေးချယ်ပါ');
      input.appendChild(blank);
      var options = type === 'boolean'
        ? [{ value: 'yes', en: 'Yes', mm: 'ရှိ' }, { value: 'no', en: 'No', mm: 'မရှိ' }]
        : (editor.options || []);
      options.forEach(function (option) {
        var node = document.createElement('option');
        node.value = option.value;
        node.textContent = optionLabel(option);
        input.appendChild(node);
      });
      if (type === 'boolean' && (field.proposedValue === true || field.proposedValue === false)) input.value = field.proposedValue ? 'yes' : 'no';
      else if (field.proposedValue !== '' && field.proposedValue != null) input.value = String(field.proposedValue);
    } else if (type === 'text') {
      input = document.createElement('textarea');
      input.id = id;
      input.rows = 2;
    } else if (type === 'obstetric') {
      return obstetricEditor(id);
    } else if (type === 'babies') {
      return babiesEditor(id);
    } else if (type === 'other-visits') {
      return otherVisitsEditor(id);
    } else if (type === 'age') {
      return ageEditor(id);
    } else {
      input = document.createElement('input');
      input.id = id;
      if (type === 'number' || type === 'weight') {
        input.type = 'number';
        input.inputMode = 'decimal';
        if (editor.min != null) input.min = String(editor.min);
        if (editor.max != null) input.max = String(editor.max);
        if (editor.step) input.step = String(editor.step);
      } else if (type === 'date') {
        input.type = 'date';
      } else if (type === 'datetime') {
        input.type = 'datetime-local';
      } else {
        input.type = 'text';
      }
    }
    input.className = 'field-input';
    input.dataset.inputId = id;
    return input;
  }

  function ageEditor(id) {
    var wrap = document.createElement('div');
    wrap.className = 'inline-pair';
    wrap.dataset.compound = 'age';
    wrap.dataset.inputId = id;
    wrap.appendChild(numberInput(t('Years', 'နှစ်'), 'years'));
    wrap.appendChild(numberInput(t('Months', 'လ'), 'months'));
    return wrap;
  }

  function numberInput(caption, key) {
    var label = document.createElement('label');
    label.textContent = caption;
    var input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.inputMode = 'numeric';
    input.dataset.part = key;
    input.className = 'field-input';
    label.appendChild(input);
    return label;
  }

  function obstetricEditor(id) {
    var wrap = document.createElement('div');
    wrap.dataset.compound = 'obstetric';
    wrap.dataset.inputId = id;
    wrap.appendChild(obstetricRow());
    var add = document.createElement('button');
    add.type = 'button';
    add.className = 'secondary-btn';
    add.textContent = t('Add pregnancy', 'ကိုယ်ဝန်တစ်ခု ထည့်ရန်');
    add.addEventListener('click', function () { wrap.insertBefore(obstetricRow(), add); });
    wrap.appendChild(add);
    return wrap;
  }

  function obstetricRow() {
    var row = document.createElement('div');
    row.className = 'repeat-row';
    row.dataset.obRow = '1';
    var year = document.createElement('input');
    year.dataset.part = 'year';
    year.type = 'number';
    year.placeholder = t('Year', 'ခုနှစ်');
    year.className = 'field-input';
    var delivery = document.createElement('select');
    delivery.dataset.part = 'deliveryType';
    delivery.className = 'field-input';
    [choice('', t('Delivery type', 'မွေးဖွားနည်း'))].concat([
      ['ရိုးရိုးမွေး', 'Normal delivery', 'ရိုးရိုးမွေး'],
      ['လမစေ့မွေး', 'Preterm birth', 'လမစေ့မွေး'],
      ['အသေမွေး', 'Stillbirth', 'အသေမွေး'],
      ['ညှပ်ဆွဲ', 'Forceps', 'ညှပ်ဆွဲ'],
      ['လေစုပ်', 'Vacuum', 'လေစုပ်'],
      ['ဗိုက်ခွဲ', 'Cesarean section', 'ဗိုက်ခွဲ'],
      ['သားပျက်', 'Abortion', 'သားပျက်']
    ].map(function (item) { return choice(item[0], item[1], item[2]); })).forEach(function (option) {
      var node = document.createElement('option');
      node.value = option.value;
      node.textContent = option.value ? optionLabel(option) : option.en;
      delivery.appendChild(node);
    });
    row.appendChild(year);
    row.appendChild(delivery);
    ['birthPlace', 'attendant', 'conditionAfterBirth'].forEach(function (key) {
      var input = document.createElement('input');
      input.dataset.part = key;
      input.className = 'field-input';
      input.placeholder = key === 'birthPlace' ? t('Place', 'နေရာ') : (key === 'attendant' ? t('Attendant', 'မွေးဖွားသူ') : t('Condition', 'အခြေအနေ'));
      row.appendChild(input);
    });
    var weight = document.createElement('input');
    weight.dataset.part = 'birthWeightKg';
    weight.type = 'number';
    weight.step = '0.01';
    weight.placeholder = t('Weight kg', 'အလေးချိန်');
    weight.className = 'field-input';
    row.appendChild(weight);
    return row;
  }

  function choice(value, en, mm) {
    return { value: value, en: en, mm: mm };
  }

  function babiesEditor(id) {
    var wrap = document.createElement('div');
    wrap.dataset.compound = 'babies';
    wrap.dataset.inputId = id;
    wrap.appendChild(babyRow(1));
    var add = document.createElement('button');
    add.type = 'button';
    add.className = 'secondary-btn';
    add.textContent = t('Add twin', 'အမွှာထည့်ရန်');
    add.addEventListener('click', function () { wrap.insertBefore(babyRow(wrap.querySelectorAll('[data-baby-row]').length + 1), add); });
    wrap.appendChild(add);
    return wrap;
  }

  function babyRow(index) {
    var row = document.createElement('div');
    row.className = 'repeat-row';
    row.dataset.babyRow = '1';
    var caption = document.createElement('strong');
    caption.textContent = t('Baby ', 'ကလေး ') + index;
    row.appendChild(caption);
    row.appendChild(textPart('babyName', t('Name', 'အမည်')));
    row.appendChild(selectPart('gender', [[ '', t('Sex', 'ကျား/မ') ], [ 'male', t('Male', 'ကျား') ], [ 'female', t('Female', 'မ') ]]));
    row.appendChild(selectPart('outcome', [[ '', t('Outcome', 'ရလဒ်') ], [ 'alive', t('Alive', 'ရှင်') ], [ 'death', t('Death', 'သေ') ], [ 'stillbirth', t('Stillbirth', 'သေမွေး') ]]));
    var weight = textPart('birthWeightKg', t('Weight kg', 'အလေးချိန် kg'));
    weight.type = 'number';
    weight.step = '0.001';
    weight.min = '0.3';
    weight.max = '7';
    row.appendChild(weight);
    var time = textPart('birthTime', '');
    time.type = 'datetime-local';
    row.appendChild(time);
    row.appendChild(selectPart('anusPresent', [[ '', t('Anus', 'စအိုပေါက်') ], [ 'yes', t('Yes', 'ရှိ') ], [ 'no', t('No', 'မရှိ') ]]));
    row.appendChild(textPart('causeOfDeath', t('Cause of death if needed', 'သေဆုံးရသည့်အကြောင်း')));
    return row;
  }

  function textPart(key, placeholder) {
    var input = document.createElement('input');
    input.dataset.part = key;
    input.placeholder = placeholder;
    input.className = 'field-input';
    return input;
  }

  function selectPart(key, options) {
    var select = document.createElement('select');
    select.dataset.part = key;
    select.className = 'field-input';
    options.forEach(function (option) {
      var node = document.createElement('option');
      node.value = option[0];
      node.textContent = option[1];
      select.appendChild(node);
    });
    return select;
  }

  function otherVisitsEditor(id) {
    var wrap = document.createElement('div');
    wrap.dataset.compound = 'other-visits';
    wrap.dataset.inputId = id;
    var title = document.createElement('p');
    title.textContent = t('Other-facility visits', 'အခြားဌာနတွင် ပြသခဲ့သောအကြိမ်များ');
    wrap.appendChild(title);
    wrap.appendChild(otherVisitRow());
    var add = document.createElement('button');
    add.type = 'button';
    add.className = 'secondary-btn';
    add.textContent = t('Add visit', 'အကြိမ်ထည့်ရန်');
    add.addEventListener('click', function () { wrap.insertBefore(otherVisitRow(), add); });
    wrap.appendChild(add);
    return wrap;
  }

  function otherVisitRow() {
    var row = document.createElement('div');
    row.className = 'repeat-row';
    row.dataset.otherRow = '1';
    var date = document.createElement('input');
    date.type = 'date';
    date.dataset.part = 'visitDate';
    date.className = 'field-input';
    var type = document.createElement('select');
    type.dataset.part = 'facilityType';
    type.className = 'field-input';
    ['', 'Public', 'Private'].forEach(function (value) {
      var option = document.createElement('option');
      option.value = value;
      option.textContent = value || t('Facility type', 'ဌာနအမျိုးအစား');
      type.appendChild(option);
    });
    var name = document.createElement('input');
    name.dataset.part = 'facilityName';
    name.placeholder = t('Facility name', 'ဌာနအမည်');
    name.className = 'field-input';
    row.appendChild(date);
    row.appendChild(type);
    row.appendChild(name);
    return row;
  }

  function selectedRecords() {
    var grouped = new Map();
    document.querySelectorAll('.record-card').forEach(function (card) {
      var toggle = card.querySelector('[data-record-toggle]');
      if (toggle && !toggle.checked) return;
      var key = card.dataset.recordKey;
      var values = {};
      var meta = { key: key };
      card.querySelectorAll('[data-gap-id]').forEach(function (gap) {
        meta.module = gap.dataset.module;
        meta.recordId = gap.dataset.recordId || null;
        meta.create = gap.dataset.create === '1';
        meta.visitNumber = gap.dataset.visitNumber ? parseInt(gap.dataset.visitNumber, 10) : null;
        if (gap.dataset.field === '*') {
          gap.querySelectorAll('[data-input-id]').forEach(function (input) {
            var fieldKey = input.dataset.inputId.split(':').pop();
            var value = readControl(input);
            if (value !== '' && value != null && !(Array.isArray(value) && !value.length)) values[fieldKey] = value;
          });
          return;
        }
        var control = gap.querySelector('[data-input-id]');
        if (!control) return;
        var fieldValue = readControl(control);
        if (fieldValue === '' || fieldValue == null || (Array.isArray(fieldValue) && !fieldValue.length)) return;
        if (gap.dataset.babyField) {
          if (!Array.isArray(values.babies)) values.babies = [];
          var babyIndex = parseInt(gap.dataset.babyIndex, 10) || 0;
          values.babies[babyIndex] = values.babies[babyIndex] || {};
          values.babies[babyIndex][gap.dataset.babyField] = fieldValue;
          return;
        }
        values[gap.dataset.field] = fieldValue;
      });
      if (Object.keys(values).length) grouped.set(key, Object.assign(meta, { values: values }));
    });
    return Array.from(grouped.values());
  }

  function readControl(control) {
    var kind = control.dataset.compound;
    if (kind === 'age') {
      var years = control.querySelector('[data-part="years"]').value;
      var months = control.querySelector('[data-part="months"]').value;
      if (years === '' && months === '') return '';
      return { years: years, months: months };
    }
    if (kind === 'obstetric') {
      return Array.from(control.querySelectorAll('[data-ob-row]')).map(function (row) {
        var item = {};
        row.querySelectorAll('[data-part]').forEach(function (input) { item[input.dataset.part] = input.value; });
        return item;
      }).filter(function (item) {
        return item.year || item.deliveryType || item.birthPlace || item.attendant || item.birthWeightKg || item.conditionAfterBirth;
      });
    }
    if (kind === 'babies') {
      return Array.from(control.querySelectorAll('[data-baby-row]')).map(function (row) {
        var item = {};
        row.querySelectorAll('[data-part]').forEach(function (input) { item[input.dataset.part] = input.value; });
        return item;
      }).filter(function (item) { return item.babyName || item.birthTime || item.birthWeightKg; });
    }
    if (kind === 'other-visits') {
      return Array.from(control.querySelectorAll('[data-other-row]')).map(function (row) {
        var item = {};
        row.querySelectorAll('[data-part]').forEach(function (input) { item[input.dataset.part] = input.value; });
        return item;
      }).filter(function (item) { return item.visitDate || item.facilityType || item.facilityName; });
    }
    if (control.dataset.valueKind === 'boolean') return control.value === '' ? '' : control.value === 'yes';
    return control.value;
  }

  function updateReviewCount() {
    var count = selectedRecords().length;
    var button = document.getElementById('saveBtn');
    button.disabled = !count || state.saving;
    button.textContent = t('Save ' + count + ' selected', count + ' ခု သိမ်းရန်');
  }

  async function saveSelected() {
    if (state.saving) return;
    var requests = selectedRecords();
    if (!requests.length) return;
    var confirmed = global.AppDialog
      ? await global.AppDialog.confirm(t(
        'Save these back-fill changes? Existing values you replace stay in the audit history. Nothing is deleted.',
        'ဤပြန်ဖြည့်ချက်များကို သိမ်းမည်လား။ အစားထိုးသော တန်ဖိုးဟောင်းများကို မှတ်တမ်းတွင် ထိန်းထားပြီး ဘာမှ မဖျက်ပါ။'
      ), { title: t('Save back fill', 'ပြန်ဖြည့်ချက် သိမ်းရန်'), okLabel: t('Save', 'သိမ်းရန်'), cancelLabel: t('Cancel', 'မလုပ်တော့ပါ') })
      : global.confirm(t('Save these back-fill changes?', 'ဤပြန်ဖြည့်ချက်များကို သိမ်းမည်လား။'));
    if (!confirmed) return;
    state.saving = true;
    updateReviewCount();
    setMessage('saveStatus', t('Saving…', 'သိမ်းနေသည်…'));
    try {
      var bundle = state.bundles.get(state.activeId);
      requests.forEach(function (request) {
        if (request.module !== 'delivery' || !Array.isArray(request.values.babies)) return;
        var existingBabies = (((bundle.delivery || {}).data || {}).deliveryDetails || {}).babies || [];
        request.values.babies = request.values.babies.filter(Boolean).map(function (patch, index) {
          var prior = existingBabies[index] || {};
          var grams = prior.birthWeightGram != null ? prior.birthWeightGram : prior.birth_weight_gram;
          return Object.assign({}, prior, patch, {
            birthWeightKg: patch.birthWeightKg || patch.birthWeightGram || (grams ? grams / 1000 : ''),
            birthTime: patch.birthTime || prior.birthTime || prior.birth_time || '',
            causeOfDeath: patch.causeOfDeath || prior.causeOfDeath || prior.cause_of_death || ''
          });
        });
      });
      var result = await global.RetroactiveDataService.saveRequests(global.firebase.firestore(), state.user, bundle, requests.map(cleanRequest));
      state.bundles.set(state.activeId, result.bundle);
      state.scans.set(state.activeId, result.inspection);
      state.templates = {};
      setMessage('saveStatus', t('Saved. The list has been refreshed.', 'သိမ်းပြီးပါပြီ။ စာရင်းကို ပြန်စစ်ပြီးပါပြီ။'));
      if (!result.inspection.gapCount) closeDetail();
      else renderDetail();
      renderList();
    } catch (error) {
      console.error(error);
      var message = error.errors && error.errors[0] ? (lang() === 'en' ? error.errors[0].en : error.errors[0].mm) : error.message;
      setMessage('saveStatus', message || t('Save failed. No patient data was deleted.', 'မသိမ်းနိုင်ပါ။ လူနာဒေတာကို မဖျက်ထားပါ။'));
    } finally {
      state.saving = false;
      updateReviewCount();
    }
  }

  function cleanRequest(request) {
    return {
      module: request.module,
      recordId: request.recordId || null,
      create: request.create,
      visitNumber: request.visitNumber,
      values: request.values
    };
  }

  function closeDetail() {
    state.activeId = null;
    show('detailView', false);
    show('listView', true);
    renderList();
  }

  function bind() {
    var search = document.getElementById('patientSearch');
    search.placeholder = t('Search your patients', 'လူနာအမည် ရှာရန်');
    search.addEventListener('input', renderList);
    document.getElementById('loadMoreBtn').addEventListener('click', function () { scanMore(); });
    document.getElementById('retryBtn').addEventListener('click', function () { loadQueue(true); });
    document.getElementById('backBtn').addEventListener('click', closeDetail);
    document.getElementById('homeBtn').addEventListener('click', function () {
      if (global.AppNavBack) global.AppNavBack.toHome();
      else global.location.href = 'home.html';
    });
    document.getElementById('saveBtn').addEventListener('click', saveSelected);
    global.onAppLanguageChange = function () {
      var searchBox = document.getElementById('patientSearch');
      if (searchBox) searchBox.placeholder = t('Search your patients', 'လူနာအမည် ရှာရန်');
      renderList();
      if (state.activeId) renderDetail();
    };
    global.firebase.auth().onAuthStateChanged(function (user) {
      if (user) boot();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})(typeof globalThis !== 'undefined' ? globalThis : this);
