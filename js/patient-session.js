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
async function displayPatientBanner(containerId = 'patientBanner') {
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
  
  // Try to get LMP and GA from latest antenatal visit for most accurate calculation
  try {
    const latestVisitSnapshot = await firebase.firestore()
      .collection('patients')
      .doc(patient.id)
      .collection('antenatal_visits')
      .orderBy('visit_date', 'desc')
      .limit(1)
      .get();
    
    if (!latestVisitSnapshot.empty) {
      const latestVisit = latestVisitSnapshot.docs[0].data();
      
      // Use visit data if available
      if (latestVisit.lmp) lmpToUse = latestVisit.lmp;
      if (latestVisit.lmp_status) lmpStatusToUse = latestVisit.lmp_status;
      if (latestVisit.gestational_age) manualGAToUse = latestVisit.gestational_age;
    }
  } catch (error) {
    console.error('Error fetching latest visit for GA:', error);
    // Continue with registration data
  }
  
  // Check if LMP is unknown
  if (lmpStatusToUse === 'unknown' || lmpToUse === 'unknown') {
    // Use manual GA
    if (manualGAToUse) {
      gaDisplay = `${manualGAToUse} wks`;
    } else {
      gaDisplay = 'LMP Unknown';
    }
  } else if (lmpToUse && lmpToUse.trim() !== '') {
    // Calculate GA from LMP
    try {
      const lmpDate = new Date(lmpToUse);
      const today = new Date();
      const diffTime = today - lmpDate;
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      const weeks = Math.floor(diffDays / 7);
      gaDisplay = `${weeks} wks`;
    } catch (error) {
      console.error('Error calculating GA:', error);
      gaDisplay = 'Error';
    }
  }
  
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

