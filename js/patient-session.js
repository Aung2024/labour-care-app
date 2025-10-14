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
function displayPatientBanner(containerId = 'patientBanner') {
  const patient = getSelectedPatient();
  if (!patient) return;
  
  const data = patient.data;
  const container = document.getElementById(containerId);
  
  if (!container) {
    console.warn('Patient banner container not found');
    return;
  }
  
  const status = data.status || 'Antenatal';
  const statusClass = status.toLowerCase().replace(' ', '-');
  
  // Calculate GA
  let gaDisplay = '-';
  if (data.gestational_age) {
    gaDisplay = `${data.gestational_age} wks`;
  } else if (data.lmp && data.lmp !== 'unknown') {
    // Simple GA calculation (you may want to use the one from patient-care-hub)
    gaDisplay = 'N/A';
  }
  
  container.innerHTML = `
    <div style="background: linear-gradient(135deg, #10b981, #059669); color: white; padding: 1rem 1.5rem; border-radius: 10px; margin-bottom: 1.5rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
      <div style="flex: 1;">
        <div style="font-size: 1.2rem; font-weight: 600; margin-bottom: 0.25rem;">
          ${data.name || 'Unknown Patient'}
        </div>
        <div style="font-size: 0.9rem; opacity: 0.9;">
          Age: ${data.age || '-'} | GA: ${gaDisplay} | Status: ${status}
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

