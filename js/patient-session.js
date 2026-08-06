/**
 * Patient Session Management
 * Handles patient selection and session storage across care pages
 */

// Check if patient is selected in session
function checkPatientSession() {
  const patientId = sessionStorage.getItem('selectedPatientId');
  const patientData = sessionStorage.getItem('selectedPatientData');
  
  if (!patientId || !patientData) {
    // No patient selected, redirect to selection page
    alert('Please select a patient first.');
    window.location.href = 'list.html';
    return null;
  }
  
  try {
    return {
      id: patientId,
      data: JSON.parse(patientData)
    };
  } catch (error) {
    console.error('Error parsing patient data:', error);
    sessionStorage.removeItem('selectedPatientId');
    sessionStorage.removeItem('selectedPatientData');
    window.location.href = 'list.html';
    return null;
  }
}

// Get selected patient from session
function getSelectedPatient() {
  const patientId = sessionStorage.getItem('selectedPatientId');
  const patientData = sessionStorage.getItem('selectedPatientData');
  
  if (!patientId || !patientData) {
    return null;
  }
  
  try {
    return {
      id: patientId,
      data: JSON.parse(patientData)
    };
  } catch (error) {
    console.error('Error parsing patient data:', error);
    return null;
  }
}

// Update selected patient data in session
function updateSelectedPatient(patientData) {
  if (!patientData || !patientData.id) {
    console.error('Invalid patient data');
    return false;
  }
  
  sessionStorage.setItem('selectedPatientId', patientData.id);
  sessionStorage.setItem('selectedPatientData', JSON.stringify(patientData));
  return true;
}

// Clear patient selection
function clearPatientSession() {
  sessionStorage.removeItem('selectedPatientId');
  sessionStorage.removeItem('selectedPatientData');
}

// Add "Back to Patient Hub" button functionality
function initializePatientSessionUI() {
  // Add back button to care pages if it doesn't exist
  const backButtonHtml = `
    <button class="btn btn-outline-light btn-sm" onclick="window.location.href='patient-care-hub.html'" title="Back to Patient Hub">
      <i class="fas fa-arrow-left"></i> Back to Patient
    </button>
  `;
  
  // This can be called to add the back button dynamically
  return backButtonHtml;
}

// Display patient info banner
async function displayPatientBanner(containerId = 'patientBanner', options = {}) {
  const opts = Object.assign({ careType: 'anc' }, options || {});
  if (opts.careType === 'pnc') {
    return displayPncPatientBanner(containerId, opts);
  }
  if (opts.careType === 'newborn') {
    return displayNewbornPatientBanner(containerId, opts);
  }
  return displayAncPatientBanner(containerId);
}

function parseWeightGramValue(record) {
  if (!record) return null;
  var candidates = [
    record.current_weight_gram,
    record.visit_weight_gram,
    record.body_weight_gram,
    record.birth_weight_gram,
    record.birthWeightGram
  ];
  for (var i = 0; i < candidates.length; i++) {
    var gram = parseFloat(candidates[i]);
    if (!isNaN(gram) && gram > 0) return gram;
  }
  var kg = parseFloat(record.birth_weight_kg || record.birthWeightKg);
  if (!isNaN(kg) && kg > 0) return kg * 1000;
  return null;
}

function formatNewbornBannerAge(birthDate, lang) {
  if (window.BabyPatientUtils && typeof BabyPatientUtils.formatBabyAgeFromBirthDate === 'function') {
    return BabyPatientUtils.formatBabyAgeFromBirthDate(birthDate, lang) || '-';
  }
  if (!birthDate || isNaN(birthDate.getTime())) return '-';
  var now = new Date();
  var birthDay = new Date(birthDate.getFullYear(), birthDate.getMonth(), birthDate.getDate());
  var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  var diffDays = Math.floor((today - birthDay) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) diffDays = 0;
  var months = Math.floor(diffDays / 30);
  var years = Math.floor(months / 12);
  var remainingMonths = months % 12;
  var dayOfLife = diffDays + 1;
  if (lang === 'mm') {
    if (years > 0) return years + ' နှစ်' + (remainingMonths ? ' ' + remainingMonths + ' လ' : '');
    if (months > 0) return months + ' လ';
    return 'နေ့ ' + dayOfLife;
  }
  if (years > 0) return years + 'y' + (remainingMonths ? ' ' + remainingMonths + 'm' : '');
  if (months > 0) return months + 'm';
  return 'Day ' + dayOfLife;
}

async function displayNewbornPatientBanner(containerId) {
  const patient = getSelectedPatient();
  if (!patient) return;

  const data = patient.data || {};
  const container = document.getElementById(containerId);
  if (!container) return;

  const lang = localStorage.getItem('appLanguage') || 'mm';
  const L = function (en, mm) { return lang === 'en' ? en : mm; };

  let weightDisplay = '-';
  let ageDisplay = '-';
  let birthDate = null;

  try {
    if (window.BabyPatientUtils && typeof BabyPatientUtils.formatBabyAgeDisplay === 'function') {
      ageDisplay = BabyPatientUtils.formatBabyAgeDisplay(data, lang) || '-';
    }
  } catch (e) { /* optional */ }

  try {
    const db = firebase.firestore();
    const patientRef = db.collection('patients').doc(patient.id);
    let visitsSnap;
    try {
      visitsSnap = await patientRef.collection('newborn_care').orderBy('visitDate', 'desc').limit(30).get();
    } catch (e1) {
      try {
        visitsSnap = await patientRef.collection('newborn_care').orderBy('timestamp', 'desc').limit(30).get();
      } catch (e2) {
        visitsSnap = await patientRef.collection('newborn_care').limit(30).get();
      }
    }

    const visits = (visitsSnap && !visitsSnap.empty)
      ? visitsSnap.docs.map(function (d) { return d.data() || {}; })
      : [];

    // Prefer highest visit number's latest weight; fall back to most recent by date.
    if (visits.length) {
      visits.sort(function (a, b) {
        var va = parseInt(a.visit_number || a.visitNumber, 10) || 0;
        var vb = parseInt(b.visit_number || b.visitNumber, 10) || 0;
        if (vb !== va) return vb - va;
        return parseVisitDateMs(b) - parseVisitDateMs(a);
      });

      for (var i = 0; i < visits.length; i++) {
        var visit = visits[i];
        var visitNum = parseInt(visit.visit_number || visit.visitNumber, 10) || 1;
        var gram = null;
        if (visitNum > 1) {
          gram = parseFloat(visit.current_weight_gram || visit.visit_weight_gram);
          if (isNaN(gram) || gram <= 0) gram = null;
        }
        if (gram == null) gram = parseWeightGramValue(visit);
        if (gram != null) {
          weightDisplay = Math.round(gram) + ' g';
          break;
        }
      }

      if (!birthDate) {
        for (var j = 0; j < visits.length; j++) {
          var bt = visits[j].birth_time || visits[j].birthTime || visits[j].date_of_birth;
          if (bt) {
            birthDate = firestoreToDate(bt);
            if (birthDate && !isNaN(birthDate.getTime())) break;
            birthDate = null;
          }
        }
      }
    }

    if (weightDisplay === '-') {
      var profileGram = parseWeightGramValue(data);
      if (profileGram != null) weightDisplay = Math.round(profileGram) + ' g';
    }

    if (!birthDate) {
      birthDate = firestoreToDate(data.date_of_birth || data.birth_time || data.birthTime || data.deliveryDate);
    }
    if (ageDisplay === '-' || ageDisplay === '') {
      ageDisplay = formatNewbornBannerAge(birthDate, lang);
    }
  } catch (err) {
    console.warn('[PatientBanner] Newborn data load failed:', err);
    if (ageDisplay === '-') {
      ageDisplay = formatNewbornBannerAge(
        firestoreToDate(data.date_of_birth || data.birth_time || data.birthTime),
        lang
      );
    }
    var fallbackGram = parseWeightGramValue(data);
    if (weightDisplay === '-' && fallbackGram != null) {
      weightDisplay = Math.round(fallbackGram) + ' g';
    }
  }

  container.innerHTML =
    '<div style="background: linear-gradient(135deg, #10b981, #059669); color: white; padding: 1rem 1.25rem; border-radius: 12px; margin-bottom: 1rem;">' +
      '<div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 0.75rem;">' +
        '<div style="flex: 1; min-width: 0;">' +
          '<div style="font-size: 1.15rem; font-weight: 700; margin-bottom: 0.35rem;">' + escapeBannerHtml(data.name || L('Unknown Patient', 'မသိ')) + '</div>' +
          '<div style="font-size: 0.88rem; opacity: 0.95; line-height: 1.55;">' +
            L('Latest weight', 'နောက်ဆုံးအလေးချိန်') + ': ' + escapeBannerHtml(weightDisplay) +
            ' &nbsp;|&nbsp; ' + L('Baby age', 'ကလေးအသက်') + ': ' + escapeBannerHtml(ageDisplay) +
          '</div>' +
        '</div>' +
        '<button type="button" class="btn btn-light btn-sm" onclick="window.location.href=\'patient-care-hub.html\' + (sessionStorage.getItem(\'selectedPatientId\') ? \'?patient=\' + encodeURIComponent(sessionStorage.getItem(\'selectedPatientId\')) : \'\')" style="font-weight: 600; min-height: 44px; white-space: nowrap;">' +
          '<i class="fas fa-arrow-left me-1"></i> ' + L('Back to Patient Hub', 'လူနာ Hub သို့') +
        '</button>' +
      '</div>' +
    '</div>';
}

async function displayPncPatientBanner(containerId) {
  const patient = getSelectedPatient();
  if (!patient) return;

  const data = patient.data;
  const container = document.getElementById(containerId);
  if (!container) return;

  const lang = localStorage.getItem('appLanguage') || 'mm';
  const L = function (en, mm) { return lang === 'en' ? en : mm; };

  let deliveryDisplay = L('Not recorded', 'မမှတ်ရသေး');
  let daysPpDisplay = '-';
  let pncVisitCount = 0;
  let latestPpDays = null;

  try {
    const db = firebase.firestore();
    const patientRef = db.collection('patients').doc(patient.id);

    let visitsSnap;
    try {
      visitsSnap = await patientRef.collection('postpartum_visits').orderBy('visitDate', 'desc').limit(20).get();
      if (visitsSnap.empty) {
        visitsSnap = await patientRef.collection('postpartum_visits').orderBy('timestamp', 'desc').limit(20).get();
      }
      if (visitsSnap.empty) {
        visitsSnap = await patientRef.collection('postpartum_visits').limit(20).get();
      }
    } catch (e) {
      visitsSnap = await patientRef.collection('postpartum_visits').limit(20).get();
    }

    pncVisitCount = visitsSnap.size;

    let deliveryDate = null;
    if (!visitsSnap.empty) {
      const visits = visitsSnap.docs.map(function (d) { return d.data(); });
      visits.forEach(function (v) {
        if (v.postpartumDays != null && v.postpartumDays !== '') {
          var n = parseInt(v.postpartumDays, 10);
          if (!isNaN(n) && (latestPpDays == null || n > latestPpDays)) latestPpDays = n;
        }
      });
      const earliest = visits.slice().sort(function (a, b) {
        return parseVisitDateMs(a) - parseVisitDateMs(b);
      })[0];
      if (earliest && earliest.deliveredDateTime) {
        deliveryDate = firestoreToDate(earliest.deliveredDateTime);
      }
    }

    if (!deliveryDate) {
      try {
        const nbSnap = await patientRef.collection('newborn_care').limit(1).get();
        if (!nbSnap.empty) {
          const nb = nbSnap.docs[0].data();
          if (nb.birth_time) deliveryDate = firestoreToDate(nb.birth_time);
        }
      } catch (e) { /* optional */ }
    }

    if (!deliveryDate && data.deliveryDate) {
      deliveryDate = firestoreToDate(data.deliveryDate);
    }

    if (deliveryDate && !isNaN(deliveryDate.getTime())) {
      deliveryDisplay = deliveryDate.toLocaleDateString();
      const diffDays = Math.floor((Date.now() - deliveryDate.getTime()) / 86400000);
      daysPpDisplay = diffDays >= 0 ? (diffDays + ' ' + L('days', 'ရက်')) : '-';
    } else if (latestPpDays != null) {
      daysPpDisplay = latestPpDays + ' ' + L('days', 'ရက်');
    }
  } catch (err) {
    console.warn('[PatientBanner] PNC data load failed:', err);
  }

  container.innerHTML =
    '<div style="background: linear-gradient(135deg, #7c3aed, #6d28d9); color: white; padding: 1rem 1.25rem; border-radius: 12px; margin-bottom: 1rem;">' +
      '<div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 0.75rem;">' +
        '<div style="flex: 1; min-width: 0;">' +
          '<div style="font-size: 1.15rem; font-weight: 700; margin-bottom: 0.35rem;">' + escapeBannerHtml(data.name || L('Unknown Patient', 'မသိ')) + '</div>' +
          '<div style="font-size: 0.88rem; opacity: 0.95; line-height: 1.55;">' +
            L('Age', 'အသက်') + ': ' + escapeBannerHtml(data.age || '-') +
            ' &nbsp;|&nbsp; ' + L('Parity', 'မွေးဖွားခြင်း') + ': ' + escapeBannerHtml(data.parity || '-') +
          '</div>' +
          '<div style="font-size: 0.88rem; opacity: 0.95; line-height: 1.55; margin-top: 0.15rem;">' +
            L('Delivery', 'မွေးဖွားရက်') + ': ' + escapeBannerHtml(deliveryDisplay) +
            ' &nbsp;|&nbsp; ' + L('Days postpartum', 'မွေးပြီး') + ': ' + escapeBannerHtml(daysPpDisplay) +
          '</div>' +
          '<div style="font-size: 0.88rem; opacity: 0.95; margin-top: 0.15rem;">' +
            L('PNC visits', 'PNC အကြိမ်') + ': ' + pncVisitCount +
          '</div>' +
        '</div>' +
        '<button type="button" class="btn btn-light btn-sm" onclick="window.location.href=\'patient-care-hub.html\' + (sessionStorage.getItem(\'selectedPatientId\') ? \'?patient=\' + encodeURIComponent(sessionStorage.getItem(\'selectedPatientId\')) : \'\')" style="font-weight: 600; min-height: 44px; white-space: nowrap;">' +
          '<i class="fas fa-arrow-left me-1"></i> ' + L('Back to Patient Hub', 'လူနာ Hub သို့') +
        '</button>' +
      '</div>' +
    '</div>';
}

function escapeBannerHtml(value) {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function firestoreToDate(val) {
  if (!val) return null;
  if (val.toDate && typeof val.toDate === 'function') return val.toDate();
  if (val instanceof Date) return val;
  if (val.seconds) return new Date(val.seconds * 1000);
  return new Date(val);
}

function parseVisitDateMs(data) {
  if (!data) return 0;
  var d = firestoreToDate(data.visitDate || data.timestamp || data.createdAt);
  return d && !isNaN(d.getTime()) ? d.getTime() : 0;
}

async function displayAncPatientBanner(containerId = 'patientBanner') {
  const patient = getSelectedPatient();
  if (!patient) return;
  
  const data = patient.data;
  const container = document.getElementById(containerId);
  
  if (!container) {
    console.warn('Patient banner container not found');
    return;
  }
  
  // Calculate GA properly - prioritize latest antenatal visit data
  let gaDisplay = '-';
  let lmpToUse = data.lmp;
  let lmpStatusToUse = data.lmp_status;
  let manualGAToUse = data.gestational_age;
  
  console.log('Patient data from session:', data);
  console.log('Initial GA calculation data:', {
    lmp: lmpToUse,
    lmp_status: lmpStatusToUse,
    gestational_age: manualGAToUse
  });
  
  // Try to get LMP and GA from latest antenatal visit for most accurate calculation
  try {
    console.log('Querying antenatal visits for patient:', patient.id);
    
    let latestVisitSnapshot;
    try {
      // Try with visitDate first (camelCase)
      latestVisitSnapshot = await firebase.firestore()
        .collection('patients')
        .doc(patient.id)
        .collection('antenatal_visits')
        .orderBy('visitDate', 'desc')
        .limit(1)
        .get();
    } catch (error) {
      console.log('visitDate ordering failed, trying visit_date:', error);
      try {
        // Fallback to visit_date (snake_case)
        latestVisitSnapshot = await firebase.firestore()
          .collection('patients')
          .doc(patient.id)
          .collection('antenatal_visits')
          .orderBy('visit_date', 'desc')
          .limit(1)
          .get();
      } catch (error2) {
        console.log('visit_date ordering failed, trying timestamp:', error2);
        // Fallback to timestamp
        latestVisitSnapshot = await firebase.firestore()
          .collection('patients')
          .doc(patient.id)
          .collection('antenatal_visits')
          .orderBy('timestamp', 'desc')
          .limit(1)
          .get();
      }
    }
    
    console.log('Visit snapshot size:', latestVisitSnapshot.size);
    console.log('Visit snapshot empty:', latestVisitSnapshot.empty);
    
    if (!latestVisitSnapshot.empty) {
      const latestVisit = latestVisitSnapshot.docs[0].data();
      
      console.log('Latest visit document ID:', latestVisitSnapshot.docs[0].id);
      console.log('Latest visit data:', latestVisit);
      
      // Use visit data if available
      if (latestVisit.lmp) lmpToUse = latestVisit.lmp;
      if (latestVisit.lmp_status) lmpStatusToUse = latestVisit.lmp_status;
      if (latestVisit.gestationalAge) manualGAToUse = latestVisit.gestationalAge;
      
      console.log('Updated GA calculation data:', {
        lmp: lmpToUse,
        lmp_status: lmpStatusToUse,
        gestational_age: manualGAToUse
      });
    } else {
      console.log('No antenatal visits found, using registration data');
      
      // Let's also try to get all visits to see what's there
      const allVisitsSnapshot = await firebase.firestore()
        .collection('patients')
        .doc(patient.id)
        .collection('antenatal_visits')
        .get();
      
      console.log('Total visits found:', allVisitsSnapshot.size);
      if (allVisitsSnapshot.size > 0) {
        console.log('All visits:', allVisitsSnapshot.docs.map(doc => ({ id: doc.id, data: doc.data() })));
      }
    }
  } catch (error) {
    console.error('Error fetching latest visit for GA:', error);
    // Continue with registration data
  }
  
  // Check if LMP is unknown
  if (lmpStatusToUse === 'unknown' || lmpToUse === 'unknown') {
    // Use manual GA
    console.log('LMP is unknown, using manual GA:', manualGAToUse);
    if (manualGAToUse) {
      gaDisplay = `${manualGAToUse} wks`;
    } else {
      gaDisplay = 'LMP Unknown';
    }
  } else if (lmpToUse && lmpToUse.trim() !== '') {
    // Calculate GA from LMP
    try {
      console.log('Calculating GA from LMP:', lmpToUse);
      
      // Handle different date formats
      let lmpDate;
      if (lmpToUse.includes('T')) {
        // ISO format with time
        lmpDate = new Date(lmpToUse);
      } else if (lmpToUse.includes('-')) {
        // Date format YYYY-MM-DD
        lmpDate = new Date(lmpToUse + 'T00:00:00');
      } else {
        // Try parsing as is
        lmpDate = new Date(lmpToUse);
      }
      
      // Validate the date
      if (isNaN(lmpDate.getTime())) {
        throw new Error('Invalid date format');
      }
      
      const today = new Date();
      const diffTime = today - lmpDate;
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      const weeks = Math.floor(diffDays / 7);
      
      // Ensure weeks is not negative
      if (weeks < 0) {
        gaDisplay = '0 wks';
      } else if (weeks > 42) {
        gaDisplay = '42+ wks';
      } else {
        gaDisplay = `${weeks} wks`;
      }
      
      console.log('GA calculation result:', { 
        lmpDate: lmpDate.toISOString(), 
        today: today.toISOString(),
        diffDays, 
        weeks, 
        gaDisplay 
      });
    } catch (error) {
      console.error('Error calculating GA:', error);
      gaDisplay = 'Error';
    }
  } else {
    console.log('No valid LMP found, GA display will be dash');
  }
  
  console.log('Final GA display:', gaDisplay);
  
  container.innerHTML = `
    <div style="background: linear-gradient(135deg, #10b981, #059669); color: white; padding: 1rem 1.5rem; border-radius: 10px; margin-bottom: 1.5rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
      <div style="flex: 1;">
        <div style="font-size: 1.2rem; font-weight: 600; margin-bottom: 0.25rem;">
          ${data.name || 'Unknown Patient'}
        </div>
        <div style="font-size: 0.9rem; opacity: 0.9;">
          Age: ${data.age || '-'} | GA: ${gaDisplay}
        </div>
      </div>
      <div>
        <button class="btn btn-light btn-sm" onclick="window.location.href='patient-care-hub.html'" style="font-weight: 600;">
          <i class="fas fa-arrow-left me-1"></i> Back to Patient Hub
        </button>
      </div>
    </div>
  `;
}

// Initialize on page load (call this at the end of care pages)
function initializePatientSession(requirePatient = true) {
  if (requirePatient) {
    const patient = checkPatientSession();
    if (!patient) {
      return null;
    }
    return patient;
  } else {
    return getSelectedPatient();
  }
}

