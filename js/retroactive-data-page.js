/**
 * Categorized midwife Back Fill page.
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

  function choice(value, en, mm) {
    return { value: value, en: en, mm: mm };
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
    if (String(data.role || '').toLowerCase() !== 'midwife') {
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

  function categoryOf(scan, id) {
    return (scan.categories || []).find(function (item) { return item.id === id; }) || null;
  }

  function listSummary(scan) {
    var bits = [];
    var registration = categoryOf(scan, 'registration');
    var anc = categoryOf(scan, 'anc');
    var delivery = categoryOf(scan, 'delivery');
    var pnc = categoryOf(scan, 'pnc');
    if (registration && registration.missingCount) bits.push(t('Registration ' + registration.missingCount + ' missing', 'မှတ်ပုံတင် ' + registration.missingCount + ' ချက်လို'));
    if (anc && anc.applicable) bits.push(t(anc.visitCount + ' ANC visits', 'ANC ' + anc.visitCount + ' ကြိမ်'));
    if (delivery && delivery.applicable && delivery.missingCount) bits.push(t('Delivery incomplete', 'မွေးဖွားမှတ်တမ်း မပြည့်'));
    if (pnc && pnc.applicable && pnc.missingCount) bits.push(t('PNC incomplete', 'PNC မပြည့်'));
    var links = categoryOf(scan, 'newborn-links');
    if (links && links.missingCount) bits.push(t('Newborn records missing', 'ကလေးမှတ်တမ်း လိုသေးသည်'));
    return bits.join(' · ');
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
      empty.textContent = t('No missing required data in the patients checked so far.', 'ယခုစစ်ထားသော လူနာများတွင် မဖြစ်မနေ ပြန်ဖြည့်ရန် အချက် မတွေ့ပါ။');
      list.appendChild(empty);
      return;
    }
    rows.forEach(function (scan) { list.appendChild(patientButton(scan)); });
  }

  function patientButton(scan) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'patient-row';
    var left = document.createElement('span');
    var name = document.createElement('strong');
    name.textContent = scan.patientName || t('Unnamed patient', 'အမည်မရှိ');
    var meta = document.createElement('span');
    meta.className = 'patient-meta';
    meta.textContent = scan.pending
      ? t('Not checked yet', 'မစစ်ရသေး')
      : ((scan.gapCount ? t(scan.gapCount + ' required items', scan.gapCount + ' ချက်လို') : t('Complete', 'ပြည့်စုံ')) + (listSummary(scan) ? ' · ' + listSummary(scan) : ''));
    left.appendChild(name);
    left.appendChild(meta);
    button.appendChild(left);
    button.addEventListener('click', function () { openPatient(scan.patientId); });
    return button;
  }

  async function openPatient(patientId) {
    state.activeId = patientId;
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
    document.getElementById('detailMeta').textContent = scan.gapCount
      ? t(scan.gapCount + ' required items left', scan.gapCount + ' ချက် ဖြည့်ရန်ကျန်သည်')
      : t('Required back-fill is complete for this patient.', 'ဤလူနာအတွက် မဖြစ်မနေ ပြန်ဖြည့်ရန် မကျန်တော့ပါ။');
    scan.categories.forEach(function (category) {
      if (!category.applicable) return;
      host.appendChild(categoryCard(category, bundle, scan));
    });
    host.querySelectorAll('input, select, textarea').forEach(function (el) {
      var mark = function () {
        var card = el.closest('.group-card');
        if (card) card.dataset.dirty = '1';
        updateReviewCount();
      };
      el.addEventListener('change', mark);
      el.addEventListener('input', mark);
    });
    updateReviewCount();
  }

  function categoryCard(category, bundle, scan) {
    var card = document.createElement('section');
    card.className = 'category-card';
    card.dataset.category = category.id;
    var open = category.missingCount > 0 || category.id === 'test';
    var head = document.createElement('button');
    head.type = 'button';
    head.className = 'category-head';
    head.setAttribute('aria-expanded', open ? 'true' : 'false');
    var title = document.createElement('strong');
    title.textContent = label(category);
    var counts = document.createElement('span');
    counts.textContent = categoryCopy(category);
    head.appendChild(title);
    head.appendChild(counts);
    var body = document.createElement('div');
    body.className = 'category-body';
    body.hidden = !open;
    head.addEventListener('click', function () {
      body.hidden = !body.hidden;
      head.setAttribute('aria-expanded', body.hidden ? 'false' : 'true');
    });
    card.appendChild(head);
    if (category.id === 'anc' && category.visitCount) {
      var visitNote = document.createElement('p');
      visitNote.className = 'hint-copy';
      visitNote.textContent = t(
        'This mother has ' + category.visitCount + ' ANC visit records.',
        'ဤမိခင်တွင် ANC ပြသမှု ' + category.visitCount + ' ကြိမ် ရှိသည်။'
      );
      body.appendChild(visitNote);
    }
    if (category.id === 'test') {
      var labNote = document.createElement('p');
      labNote.className = 'hint-copy';
      labNote.textContent = t(
        'Labs are optional. Fill only if a test was done and the result is available.',
        'ဓာတ်ခွဲသည် မဖြည့်လည်း ရသည်။ စစ်ထားပြီး အဖြေရှိမှသာ ဖြည့်ပါ။'
      );
      body.appendChild(labNote);
    }
    category.groups.forEach(function (group) {
      if (group.status === 'not_needed' && group.key !== 'youngestChildAge') return;
      body.appendChild(groupBlock(group, category));
    });
    if (category.id === 'test') body.appendChild(labAddBlock());
    category.redirects.forEach(function (item) { body.appendChild(redirectCard(item, bundle, scan)); });
    card.appendChild(body);
    return card;
  }

  function categoryCopy(category) {
    if (category.id === 'anc') {
      return t(
        category.visitCount + ' visits · ' + category.missingCount + ' missing · ' + category.filledCount + ' filled',
        category.visitCount + ' ကြိမ် · လို ' + category.missingCount + ' · ပြည့် ' + category.filledCount
      );
    }
    if (category.optional) {
      return t('Optional', 'မဖြည့်လည်း ရသည်');
    }
    return t(
      category.missingCount + ' missing · ' + category.filledCount + ' filled',
      'လို ' + category.missingCount + ' · ပြည့် ' + category.filledCount
    );
  }

  function groupBlock(group, category) {
    var wrap = document.createElement('article');
    wrap.className = 'group-card' + (group.status === 'ok' ? ' is-complete' : '') + (group.status === 'not_needed' ? ' is-skip' : '');
    wrap.dataset.groupKey = group.key;
    wrap.dataset.module = group.module || category.id;
    wrap.dataset.mode = group.mode;
    wrap.dataset.status = group.status;
    wrap.dataset.optional = group.optional ? '1' : '0';
    if (group.recordId) wrap.dataset.recordId = group.recordId;
    var title = document.createElement('h3');
    title.textContent = label(group);
    wrap.appendChild(title);
    if (group.status === 'not_needed') {
      var skip = document.createElement('p');
      skip.className = 'skip-copy';
      skip.textContent = lang() === 'en' ? group.notNeededReasonEn : group.notNeededReasonMm;
      wrap.appendChild(skip);
      return wrap;
    }
    if (group.status === 'ok') {
      var done = document.createElement('p');
      done.className = 'ok-copy';
      done.textContent = t('Already filled.', 'ဖြည့်ပြီးပါပြီ။');
      wrap.appendChild(done);
      var edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'secondary-btn';
      edit.textContent = t('Change', 'ပြင်ရန်');
      wrap.appendChild(edit);
      var editors = document.createElement('div');
      editors.hidden = true;
      editors.dataset.filledEditors = '1';
      edit.addEventListener('click', function () {
        editors.hidden = !editors.hidden;
        edit.textContent = editors.hidden ? t('Change', 'ပြင်ရန်') : t('Hide', 'ပိတ်ရန်');
      });
      wrap.appendChild(editors);
      attachEditors(editors, group);
      return wrap;
    } else if (group.totalVisits) {
      var progress = document.createElement('p');
      progress.className = 'hint-copy';
      progress.textContent = t(
        group.filledVisits + ' of ' + group.totalVisits + ' visits filled',
        group.totalVisits + ' ကြိမ်အနက် ' + group.filledVisits + ' ကြိမ် ဖြည့်ပြီး'
      );
      wrap.appendChild(progress);
    }
    if (group.hintEn) {
      var hint = document.createElement('p');
      hint.className = 'hint-copy';
      hint.textContent = lang() === 'en' ? group.hintEn : group.hintMm;
      wrap.appendChild(hint);
    }
    attachEditors(wrap, group);
    return wrap;
  }

  function attachEditors(host, group) {
    if (group.mode === 'apply-choice') host.appendChild(applyToggle(group));
    if (group.mode === 'per-visit') host.appendChild(perVisitEditors(group));
    else if (group.mode === 'apply-choice') {
      host.appendChild(allEditor(group));
      host.appendChild(perVisitEditors(group, true));
    } else {
      host.appendChild(onceEditor(group));
    }
    host.querySelectorAll('input, select, textarea').forEach(function (el) {
      var mark = function () {
        var card = el.closest('.group-card');
        if (card) card.dataset.dirty = '1';
        updateReviewCount();
      };
      el.addEventListener('change', mark);
      el.addEventListener('input', mark);
    });
  }

  function applyToggle(group) {
    var box = document.createElement('div');
    box.className = 'apply-toggle';
    box.appendChild(radio(group.key, 'all', t('Apply to all visits', 'အကြိမ်အားလုံးသို့ သုံးရန်'), true));
    box.appendChild(radio(group.key, 'each', t('Set each visit', 'အကြိမ်အလိုက် ဖြည့်ရန်'), false));
    return box;
  }

  function radio(groupKey, mode, caption, checked) {
    var labelEl = document.createElement('label');
    var input = document.createElement('input');
    input.type = 'radio';
    input.name = 'apply-' + groupKey;
    input.value = mode;
    input.checked = checked;
    input.addEventListener('change', function () {
      var card = labelEl.closest('.group-card');
      if (!card) return;
      var all = card.querySelector('[data-apply-panel="all"]');
      var each = card.querySelector('[data-apply-panel="each"]');
      if (all) all.hidden = mode !== 'all';
      if (each) each.hidden = mode !== 'each';
    });
    labelEl.appendChild(input);
    labelEl.appendChild(document.createTextNode(caption));
    return labelEl;
  }

  function onceEditor(group) {
    var box = document.createElement('div');
    box.className = 'once-panel';
    (group.fields || []).forEach(function (field) {
      if (field.key === 'provisionalDiagnosisOther') return;
      box.appendChild(fieldEditor(field, group.key + ':' + field.key, firstValue(group, field.key)));
    });
    if (group.key === 'babies') box.appendChild(babiesEditor(group.key + ':babies', group.proposedValue));
    return box;
  }

  function allEditor(group) {
    var box = document.createElement('div');
    box.dataset.applyPanel = 'all';
    (group.fields || []).forEach(function (field) {
      if (field.key === 'provisionalDiagnosisOther') return;
      box.appendChild(fieldEditor(field, group.key + ':all:' + field.key, firstValue(group, field.key)));
    });
    return box;
  }

  function perVisitEditors(group, hidden) {
    var box = document.createElement('div');
    box.dataset.applyPanel = 'each';
    if (hidden) box.hidden = true;
    (group.visits || []).forEach(function (visit) {
      var row = document.createElement('div');
      row.className = 'visit-row';
      row.dataset.recordId = visit.recordId;
      var caption = document.createElement('strong');
      caption.textContent = t('Visit ' + (visit.visitNumber || '?'), 'အကြိမ် ' + (visit.visitNumber || '?')) + (visit.visitDate ? ' · ' + visit.visitDate : '');
      row.appendChild(caption);
      (group.fields || []).forEach(function (field) {
        if (field.key === 'provisionalDiagnosisOther') return;
        var current = visit.values ? visit.values[field.key] : visit.currentValue;
        row.appendChild(fieldEditor(field, group.key + ':' + visit.recordId + ':' + field.key, current));
      });
      box.appendChild(row);
    });
    return box;
  }

  function firstValue(group, key) {
    if (key && group.proposedValue && typeof group.proposedValue === 'object' && !Array.isArray(group.proposedValue) && group.proposedValue[key] != null && group.proposedValue[key] !== '') {
      return group.proposedValue[key];
    }
    if (group.proposedValue && !(group.visits && group.visits.length)) {
      return group.proposedValue;
    }
    var found = '';
    (group.visits || []).forEach(function (visit) {
      if (found !== '' && found != null) return;
      found = visit.values ? visit.values[key] : visit.currentValue;
    });
    return found;
  }

  function fieldEditor(field, id, value) {
    var wrap = document.createElement('div');
    wrap.className = 'field-block';
    wrap.dataset.fieldKey = field.key;
    var caption = document.createElement('label');
    caption.textContent = label(field);
    caption.htmlFor = id;
    wrap.appendChild(caption);
    var control = controlFor(field, id, value);
    wrap.appendChild(control);
    if (field.key === 'provisionalDiagnosisType') {
      var otherField = { key: 'provisionalDiagnosisOther', type: 'text', labelEn: 'Other diagnosis', labelMm: 'အခြားရောဂါအမည်' };
      var other = fieldEditor(otherField, id + ':other', '');
      other.hidden = String(value) !== 'Other';
      wrap.appendChild(other);
      control.addEventListener('change', function () {
        other.hidden = control.value !== 'Other';
      });
    }
    if (field.key === 'ultrasoundServices') {
      var detailsField = { key: 'ultrasoundDetails', type: 'text', labelEn: 'Ultrasound details', labelMm: 'Ultrasound အသေးစိတ်' };
      var details = fieldEditor(detailsField, id + ':details', '');
      details.hidden = String(value) !== 'Yes';
      wrap.appendChild(details);
      control.addEventListener('change', function () {
        details.hidden = control.value !== 'Yes';
      });
    }
    return wrap;
  }

  function labAddBlock() {
    var wrap = document.createElement('article');
    wrap.className = 'group-card';
    wrap.dataset.groupKey = 'newLab';
    wrap.dataset.module = 'test';
    wrap.dataset.mode = 'once';
    wrap.dataset.optional = '1';
    var title = document.createElement('h3');
    title.textContent = t('Add a lab result', 'ဓာတ်ခွဲအဖြေ ထည့်ရန်');
    wrap.appendChild(title);
    var fields = global.RetroactiveDataRules && global.RetroactiveDataRules.fieldMap
      ? global.RetroactiveDataRules.fieldMap('test')
      : {};
    Object.keys(fields).forEach(function (key) {
      if (key === 'ultrasoundDetails') return;
      wrap.appendChild(fieldEditor(fields[key], 'newLab:' + key, ''));
    });
    return wrap;
  }

  function redirectCard(item, bundle, scan) {
    var card = document.createElement('a');
    card.className = 'redirect-card';
    card.href = item.href + '?patient=' + encodeURIComponent(scan.patientId);
    card.textContent = '';
    var title = document.createElement('strong');
    title.textContent = label(item);
    var copy = document.createElement('span');
    copy.textContent = item.missing
      ? t('Missing. Open the care page to record it.', 'မရှိသေးပါ။ မှတ်ရန် စောင့်ရှောက်မှုစာမျက်နှာသို့ သွားပါ။')
      : t('Already recorded. Open to review or add another visit.', 'မှတ်ပြီးပါပြီ။ ပြန်ကြည့်ရန် ဖွင့်ပါ။');
    card.appendChild(title);
    card.appendChild(copy);
    card.addEventListener('click', function (event) {
      event.preventDefault();
      var patient = Object.assign({ id: scan.patientId }, (bundle.patient || {}));
      if (typeof global.updateSelectedPatient === 'function') global.updateSelectedPatient(patient);
      else {
        sessionStorage.setItem('selectedPatientId', patient.id);
        sessionStorage.setItem('selectedPatientData', JSON.stringify(patient));
      }
      global.location.href = card.href;
    });
    return card;
  }

  function controlFor(field, id, value) {
    var editor = field.editor || field;
    var type = editor.type || field.type;
    if (type === 'cdk') return cdkEditor(id, value);
    if (type === 'obstetric') return obstetricEditor(id, value);
    if (type === 'babies') return babiesEditor(id, value);
    if (type === 'other-visits') return otherVisitsEditor(id, value);
    if (type === 'age') return ageEditor(id, value);
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
        : (editor.options || field.options || []);
      options.forEach(function (option) {
        var node = document.createElement('option');
        node.value = option.value;
        node.textContent = optionLabel(option);
        input.appendChild(node);
      });
      if (type === 'boolean' && (value === true || value === false)) input.value = value ? 'yes' : 'no';
      else if (value !== '' && value != null) input.value = String(value);
    } else if (type === 'text') {
      input = document.createElement('textarea');
      input.id = id;
      input.rows = 2;
      if (value) input.value = String(value);
    } else {
      input = document.createElement('input');
      input.id = id;
      if (type === 'number' || type === 'weight') {
        input.type = 'number';
        input.inputMode = 'decimal';
        if (editor.min != null) input.min = String(editor.min);
        if (editor.max != null) input.max = String(editor.max);
        if (editor.step) input.step = String(editor.step);
        if (type === 'weight' && value > 20) input.value = String(value / 1000);
        else if (value !== '' && value != null) input.value = String(value);
      } else if (type === 'date') {
        input.type = 'date';
        if (value) input.value = String(value).slice(0, 10);
      } else if (type === 'datetime') {
        input.type = 'datetime-local';
        if (value) input.value = String(value).slice(0, 16);
      } else {
        input.type = 'text';
        if (value) input.value = String(value);
      }
    }
    input.className = 'field-input';
    input.dataset.inputId = id;
    return input;
  }

  function cdkEditor(id, value) {
    var wrap = document.createElement('div');
    wrap.dataset.compound = 'cdk';
    wrap.dataset.inputId = id;
    var date = document.createElement('input');
    date.type = 'date';
    date.className = 'field-input';
    date.dataset.part = 'date';
    if (value && value !== 'not_given') date.value = String(value).slice(0, 10);
    var notGiven = document.createElement('label');
    notGiven.className = 'check-row';
    var box = document.createElement('input');
    box.type = 'checkbox';
    box.dataset.part = 'notGiven';
    box.checked = value === 'not_given';
    date.disabled = box.checked;
    box.addEventListener('change', function () { date.disabled = box.checked; });
    notGiven.appendChild(box);
    notGiven.appendChild(document.createTextNode(t('Not given', 'မပေးခဲ့ပါ')));
    wrap.appendChild(date);
    wrap.appendChild(notGiven);
    return wrap;
  }

  function ageEditor(id, value) {
    var wrap = document.createElement('div');
    wrap.className = 'inline-pair';
    wrap.dataset.compound = 'age';
    wrap.dataset.inputId = id;
    var years = numberInput(t('Years', 'နှစ်'), 'years');
    var months = numberInput(t('Months', 'လ'), 'months');
    if (value && value.years != null) years.querySelector('input').value = value.years;
    if (value && value.months != null) months.querySelector('input').value = value.months;
    wrap.appendChild(years);
    wrap.appendChild(months);
    return wrap;
  }

  function numberInput(caption, key) {
    var labelEl = document.createElement('label');
    labelEl.textContent = caption;
    var input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.inputMode = 'numeric';
    input.dataset.part = key;
    input.className = 'field-input';
    labelEl.appendChild(input);
    return labelEl;
  }

  function obstetricEditor(id, value) {
    var wrap = document.createElement('div');
    wrap.dataset.compound = 'obstetric';
    wrap.dataset.inputId = id;
    var rows = Array.isArray(value) && value.length ? value : [{}];
    rows.forEach(function (row) { wrap.appendChild(obstetricRow(row)); });
    var add = document.createElement('button');
    add.type = 'button';
    add.className = 'secondary-btn';
    add.textContent = t('Add previous pregnancy', 'ယခင်ကိုယ်ဝန် ထည့်ရန်');
    add.addEventListener('click', function () { wrap.insertBefore(obstetricRow({}), add); });
    wrap.appendChild(add);
    return wrap;
  }

  function obstetricField(captionEn, captionMm, control) {
    var wrap = document.createElement('label');
    wrap.className = 'field-block';
    wrap.appendChild(document.createTextNode(t(captionEn, captionMm)));
    wrap.appendChild(control);
    return wrap;
  }

  function obstetricRow(data) {
    var row = document.createElement('div');
    row.className = 'repeat-row obstetric-row';
    row.dataset.obRow = '1';
    var year = document.createElement('input');
    year.dataset.part = 'year';
    year.type = 'number';
    year.min = '1950';
    year.max = '2100';
    year.inputMode = 'numeric';
    year.className = 'field-input';
    if (data && data.year) year.value = data.year;
    row.appendChild(obstetricField('Previous pregnancies (year)', 'ယခင်ကိုယ်ဝန် (ခုနှစ်)', year));

    var delivery = document.createElement('select');
    delivery.dataset.part = 'deliveryType';
    delivery.className = 'field-input';
    var blank = document.createElement('option');
    blank.value = '';
    blank.textContent = t('Select', 'ရွေးချယ်ပါ');
    delivery.appendChild(blank);
    var types = (global.RetroactiveDataRules && global.RetroactiveDataRules.obstetricDeliveryTypes) || [];
    types.forEach(function (option) {
      var node = document.createElement('option');
      node.value = option.value;
      node.textContent = optionLabel(option);
      delivery.appendChild(node);
    });
    var mapped = global.RetroactiveDataRules && global.RetroactiveDataRules.mapLegacyDeliveryType
      ? global.RetroactiveDataRules.mapLegacyDeliveryType(data && (data.deliveryType || data.outcome))
      : (data && data.deliveryType) || '';
    if (mapped) delivery.value = mapped;
    row.appendChild(obstetricField('Mode of delivery', 'မွေးဖွားပုံ', delivery));

    var place = document.createElement('input');
    place.dataset.part = 'birthPlace';
    place.type = 'text';
    place.className = 'field-input';
    if (data && data.birthPlace) place.value = data.birthPlace;
    row.appendChild(obstetricField('Birth place', 'မွေးဖွားသည့်နေရာ', place));

    var attendant = document.createElement('input');
    attendant.dataset.part = 'attendant';
    attendant.type = 'text';
    attendant.className = 'field-input';
    if (data && data.attendant) attendant.value = data.attendant;
    row.appendChild(obstetricField('Birth attendant', 'မွေးဖွားပေးသူ', attendant));

    var weight = document.createElement('input');
    weight.dataset.part = 'birthWeightKg';
    weight.type = 'number';
    weight.min = '0';
    weight.max = '8';
    weight.step = '0.01';
    weight.inputMode = 'decimal';
    weight.className = 'field-input';
    if (data && (data.birthWeightKg != null && data.birthWeightKg !== '')) weight.value = data.birthWeightKg;
    row.appendChild(obstetricField('Birth weight (kg)', 'မွေးဖွားချိန် အလေးချိန် (ကီလို)', weight));

    var condition = document.createElement('input');
    condition.dataset.part = 'conditionAfterBirth';
    condition.type = 'text';
    condition.className = 'field-input';
    if (data && data.conditionAfterBirth) condition.value = data.conditionAfterBirth;
    row.appendChild(obstetricField('Condition after birth', 'မွေးပြီး အခြေအနေ', condition));

    var remark = document.createElement('input');
    remark.dataset.part = 'remark';
    remark.type = 'text';
    remark.className = 'field-input';
    if (data && (data.remark || data.notes)) remark.value = data.remark || data.notes;
    row.appendChild(obstetricField('Remark', 'မှတ်ချက်', remark));
    return row;
  }

  function babiesEditor(id, value) {
    var wrap = document.createElement('div');
    wrap.dataset.compound = 'babies';
    wrap.dataset.inputId = id;
    var rows = Array.isArray(value) && value.length ? value : [{}];
    rows.forEach(function (row, index) { wrap.appendChild(babyRow(index + 1, row)); });
    var add = document.createElement('button');
    add.type = 'button';
    add.className = 'secondary-btn';
    add.textContent = t('Add twin', 'အမွှာထည့်ရန်');
    add.addEventListener('click', function () { wrap.insertBefore(babyRow(wrap.querySelectorAll('[data-baby-row]').length + 1, {}), add); });
    wrap.appendChild(add);
    return wrap;
  }

  function babyRow(index, data) {
    var row = document.createElement('div');
    row.className = 'repeat-row';
    row.dataset.babyRow = '1';
    var caption = document.createElement('strong');
    caption.textContent = t('Baby ', 'ကလေး ') + index;
    row.appendChild(caption);
    row.appendChild(textPart('babyName', t('Name', 'အမည်'), data && data.babyName));
    row.appendChild(selectPart('gender', [['', t('Sex', 'ကျား/မ')], ['male', t('Male', 'ကျား')], ['female', t('Female', 'မ')]], data && data.gender));
    row.appendChild(selectPart('outcome', [['', t('Outcome', 'ရလဒ်')], ['alive', t('Alive', 'ရှင်')], ['death', t('Death', 'သေ')], ['stillbirth', t('Stillbirth', 'သေမွေး')]], data && data.outcome));
    var grams = data && (data.birthWeightGram != null ? data.birthWeightGram : data.birth_weight_gram);
    var weight = textPart('birthWeightKg', t('Weight kg', 'အလေးချိန် kg'), grams > 20 ? grams / 1000 : grams);
    weight.type = 'number';
    weight.step = '0.001';
    row.appendChild(weight);
    row.appendChild(textPart('birthTime', '', data && (data.birthTime || data.birth_time), 'datetime-local'));
    row.appendChild(selectPart('anusPresent', [['', t('Anus', 'စအိုပေါက်')], ['yes', t('Yes', 'ရှိ')], ['no', t('No', 'မရှိ')]], data && data.anusPresent));
    row.appendChild(textPart('causeOfDeath', t('Cause of death if needed', 'သေဆုံးရသည့်အကြောင်း'), data && (data.causeOfDeath || data.cause_of_death)));
    return row;
  }

  function textPart(key, placeholder, value, type) {
    var input = document.createElement('input');
    input.dataset.part = key;
    input.placeholder = placeholder;
    input.className = 'field-input';
    if (type) input.type = type;
    if (value) input.value = type === 'datetime-local' ? String(value).slice(0, 16) : value;
    return input;
  }

  function selectPart(key, options, value) {
    var select = document.createElement('select');
    select.dataset.part = key;
    select.className = 'field-input';
    options.forEach(function (option) {
      var node = document.createElement('option');
      node.value = option[0];
      node.textContent = option[1];
      select.appendChild(node);
    });
    if (value) select.value = value;
    return select;
  }

  function otherVisitsEditor(id, value) {
    var wrap = document.createElement('div');
    wrap.dataset.compound = 'other-visits';
    wrap.dataset.inputId = id;
    var rows = Array.isArray(value) && value.length ? value : [{}];
    rows.forEach(function (row) { wrap.appendChild(otherVisitRow(row)); });
    var add = document.createElement('button');
    add.type = 'button';
    add.className = 'secondary-btn';
    add.textContent = t('Add visit', 'အကြိမ်ထည့်ရန်');
    add.addEventListener('click', function () { wrap.insertBefore(otherVisitRow({}), add); });
    wrap.appendChild(add);
    return wrap;
  }

  function otherVisitRow(data) {
    var row = document.createElement('div');
    row.className = 'repeat-row';
    row.dataset.otherRow = '1';
    var date = document.createElement('input');
    date.type = 'date';
    date.dataset.part = 'visitDate';
    date.className = 'field-input';
    if (data && data.visitDate) date.value = String(data.visitDate).slice(0, 10);
    var type = document.createElement('select');
    type.dataset.part = 'facilityType';
    type.className = 'field-input';
    [
      ['', t('Facility type', 'ဌာနအမျိုးအစား')],
      ['Public', t('Public', 'ပြည်သူ့ ကျန်းမာရေးဌာန')],
      ['Private', t('Private', 'ပုဂ္ဂလိက ကျန်းမာရေးဌာန')]
    ].forEach(function (item) {
      var option = document.createElement('option');
      option.value = item[0];
      option.textContent = item[1];
      type.appendChild(option);
    });
    if (data && data.facilityType) type.value = data.facilityType;
    var name = document.createElement('input');
    name.dataset.part = 'facilityName';
    name.placeholder = t('Facility name', 'ဌာနအမည်');
    name.className = 'field-input';
    if (data && data.facilityName) name.value = data.facilityName;
    row.appendChild(date);
    row.appendChild(type);
    row.appendChild(name);
    return row;
  }

  function selectedApplyMode(card) {
    var radioEl = card.querySelector('input[type="radio"]:checked');
    return radioEl ? radioEl.value : (card.dataset.mode === 'per-visit' ? 'each' : 'all');
  }

  function readFieldBlock(block) {
    var fieldKey = block.dataset.fieldKey;
    var control = block.querySelector('[data-input-id], select, textarea, input.field-input');
    if (!control) return null;
    var value = readControl(control);
    var extra = {};
    if (fieldKey === 'provisionalDiagnosisType') {
      var other = block.querySelector('[data-field-key="provisionalDiagnosisOther"]');
      if (other && value === 'Other') extra.provisionalDiagnosisOther = readControl(other.querySelector('[data-input-id], textarea, input'));
    }
    if (fieldKey === 'ultrasoundServices') {
      var details = block.querySelector('[data-field-key="ultrasoundDetails"]');
      if (details && value === 'Yes') extra.ultrasoundDetails = readControl(details.querySelector('[data-input-id], textarea, input'));
    }
    if (value === '' || value == null || (Array.isArray(value) && !value.length)) return extra.provisionalDiagnosisOther ? Object.assign({ key: fieldKey, value: value }, extra) : null;
    return Object.assign({ key: fieldKey, value: value }, extra);
  }

  function valuesFromPanel(panel) {
    var values = {};
    if (!panel) return values;
    panel.querySelectorAll(':scope > .field-block, :scope .field-block').forEach(function (block) {
      if (block.closest('.field-block') !== block && block.parentElement && block.parentElement.closest('.field-block')) return;
      var item = readFieldBlock(block);
      if (!item) return;
      values[item.key] = item.value;
      if (item.provisionalDiagnosisOther) values.provisionalDiagnosisOther = item.provisionalDiagnosisOther;
      if (item.ultrasoundDetails) values.ultrasoundDetails = item.ultrasoundDetails;
    });
    var compound = panel.querySelector('[data-compound]');
    if (compound && compound.closest('.group-card') === panel.closest('.group-card') && !Object.keys(values).length) {
      var group = panel.closest('.group-card');
      values[group.dataset.groupKey === 'babies' ? 'babies' : group.dataset.groupKey] = readControl(compound);
    }
    return values;
  }

  function selectedRequests() {
    var requests = [];
    document.querySelectorAll('.group-card').forEach(function (card) {
      if (card.dataset.status === 'not_needed') return;
      if (card.dataset.status === 'ok' && card.dataset.dirty !== '1') return;
      var moduleName = card.dataset.module;
      var mode = card.dataset.mode;
      var apply = selectedApplyMode(card);
      if (mode === 'per-visit' || apply === 'each') {
        var visitValues = {};
        card.querySelectorAll('.visit-row').forEach(function (row) {
          var values = {};
          row.querySelectorAll('.field-block').forEach(function (block) {
            if (block.parentElement !== row && !row.contains(block)) return;
            var item = readFieldBlock(block);
            if (!item) return;
            values[item.key] = item.value;
            if (item.provisionalDiagnosisOther) values.provisionalDiagnosisOther = item.provisionalDiagnosisOther;
            if (item.ultrasoundDetails) values.ultrasoundDetails = item.ultrasoundDetails;
          });
          if (Object.keys(values).length) visitValues[row.dataset.recordId] = values;
        });
        if (Object.keys(visitValues).length) {
          requests.push({ module: moduleName, applyTo: 'per-visit', visitValues: visitValues });
        }
        return;
      }
      var values = {};
      if (mode === 'apply-choice') values = valuesFromPanel(card.querySelector('[data-apply-panel="all"]'));
      else {
        card.querySelectorAll('.once-panel .field-block, .once-panel [data-compound], .field-block').forEach(function (node) {
          if (node.classList.contains('field-block')) {
            if (node.closest('.visit-row') || node.closest('[data-compound]')) return;
            var item = readFieldBlock(node);
            if (!item) return;
            values[item.key] = item.value;
            if (item.provisionalDiagnosisOther) values.provisionalDiagnosisOther = item.provisionalDiagnosisOther;
            if (item.ultrasoundDetails) values.ultrasoundDetails = item.ultrasoundDetails;
          } else if (node.dataset && node.dataset.compound) {
            var key = card.dataset.groupKey === 'youngestChildAge' ? 'youngestChildAge' : (card.dataset.groupKey === 'previousObstetricHistory' ? 'previousObstetricHistory' : (card.dataset.groupKey === 'otherVisits' ? 'otherVisits' : (card.dataset.groupKey === 'babies' ? 'babies' : card.dataset.groupKey)));
            var compoundValue = readControl(node);
            if (compoundValue !== '' && compoundValue != null && !(Array.isArray(compoundValue) && !compoundValue.length)) values[key] = compoundValue;
          }
        });
      }
      if (card.dataset.groupKey === 'newLab' && Object.keys(values).length) {
        requests.push({ module: 'test', values: values });
        return;
      }
      if (card.dataset.recordId && Object.keys(values).length) {
        requests.push({ module: moduleName, recordId: card.dataset.recordId, values: values });
        return;
      }
      if (!Object.keys(values).length) return;
      if (moduleName === 'registration' || moduleName === 'delivery') {
        requests.push({ module: moduleName, create: moduleName === 'delivery' && card.dataset.status === 'missing', values: values });
        return;
      }
      requests.push({ module: moduleName, applyTo: 'all', values: values });
    });
    return mergeRequests(requests);
  }

  function mergeRequests(requests) {
    var merged = [];
    requests.forEach(function (request) {
      var prior = merged.find(function (item) {
        return item.module === request.module && item.applyTo === request.applyTo && item.recordId === request.recordId && !item.visitValues && !request.visitValues;
      });
      if (prior && request.values) {
        Object.assign(prior.values, request.values);
        return;
      }
      merged.push(request);
    });
    return merged;
  }

  function readControl(control) {
    if (!control) return '';
    var kind = control.dataset.compound;
    if (kind === 'age') {
      var years = control.querySelector('[data-part="years"]').value;
      var months = control.querySelector('[data-part="months"]').value;
      if (years === '' && months === '') return '';
      return { years: years, months: months };
    }
    if (kind === 'cdk') {
      if (control.querySelector('[data-part="notGiven"]').checked) return 'not_given';
      return control.querySelector('[data-part="date"]').value;
    }
    if (kind === 'obstetric') {
      return Array.from(control.querySelectorAll('[data-ob-row]')).map(function (row) {
        var item = {};
        row.querySelectorAll('[data-part]').forEach(function (input) { item[input.dataset.part] = input.value; });
        return item;
      }).filter(function (item) {
        return item.year || item.deliveryType || item.birthPlace || item.attendant || item.birthWeightKg || item.conditionAfterBirth || item.remark;
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
    var count = selectedRequests().length;
    var button = document.getElementById('saveBtn');
    button.disabled = !count || state.saving;
    button.textContent = t('Save changes', 'ပြောင်းလဲချက် သိမ်းရန်');
  }

  async function saveSelected() {
    if (state.saving) return;
    var requests = selectedRequests();
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
      var result = await global.RetroactiveDataService.saveRequests(global.firebase.firestore(), state.user, bundle, requests);
      state.bundles.set(state.activeId, result.bundle);
      state.scans.set(state.activeId, result.inspection);
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
