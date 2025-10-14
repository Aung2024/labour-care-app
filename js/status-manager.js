/**
 * Status Management Utility
 * Handles automatic patient status updates based on care activities
 */

// Status constants
const PATIENT_STATUSES = {
  REGISTERED: 'registered',
  ANTENATAL: 'antenatal_care', 
  LABOUR: 'labour_care',
  POSTNATAL: 'postnatal_care'
};

/**
 * Update patient status in Firestore
 * @param {string} patientId - Patient document ID
 * @param {string} newStatus - New status value
 * @param {string} reason - Reason for status change (for logging)
 */
async function updatePatientStatus(patientId, newStatus, reason = '') {
  try {
    console.log(`Updating patient ${patientId} status to: ${newStatus}, reason: ${reason}`);
    
    await firebase.firestore()
      .collection('patients')
      .doc(patientId)
      .update({
        status: newStatus,
        status_updated_at: firebase.firestore.FieldValue.serverTimestamp(),
        status_update_reason: reason
      });
    
    console.log(`✅ Patient status updated successfully: ${newStatus}`);
    return true;
  } catch (error) {
    console.error(`❌ Error updating patient status:`, error);
    return false;
  }
}

/**
 * Check if patient should be moved to Antenatal Care status
 * Called when first ANC visit is recorded
 * @param {string} patientId - Patient document ID
 */
async function checkAndUpdateToAntenatalCare(patientId) {
  try {
    // Check current patient status
    const patientDoc = await firebase.firestore()
      .collection('patients')
      .doc(patientId)
      .get();
    
    if (!patientDoc.exists) {
      console.error('Patient not found:', patientId);
      return false;
    }
    
    const currentStatus = patientDoc.data().status;
    
    // Only update if patient is still in "registered" status
    if (currentStatus === PATIENT_STATUSES.REGISTERED) {
      return await updatePatientStatus(
        patientId, 
        PATIENT_STATUSES.ANTENATAL, 
        'First ANC visit recorded'
      );
    }
    
    console.log(`Patient status is already ${currentStatus}, no update needed`);
    return true;
  } catch (error) {
    console.error('Error checking antenatal care status:', error);
    return false;
  }
}

/**
 * Check if patient should be moved to Labour Care status
 * Called when active first stage time is recorded in summary.html
 * @param {string} patientId - Patient document ID
 */
async function checkAndUpdateToLabourCare(patientId) {
  try {
    // Check current patient status
    const patientDoc = await firebase.firestore()
      .collection('patients')
      .doc(patientId)
      .get();
    
    if (!patientDoc.exists) {
      console.error('Patient not found:', patientId);
      return false;
    }
    
    const currentStatus = patientDoc.data().status;
    
    // Update if patient is in "registered" or "antenatal_care" status
    if (currentStatus === PATIENT_STATUSES.REGISTERED || 
        currentStatus === PATIENT_STATUSES.ANTENATAL) {
      return await updatePatientStatus(
        patientId, 
        PATIENT_STATUSES.LABOUR, 
        'Active first stage time recorded'
      );
    }
    
    console.log(`Patient status is already ${currentStatus}, no update needed`);
    return true;
  } catch (error) {
    console.error('Error checking labour care status:', error);
    return false;
  }
}

/**
 * Check if patient should be moved to Postnatal Care status
 * Called when any postnatal visit is recorded OR second stage time is recorded
 * @param {string} patientId - Patient document ID
 * @param {string} reason - Specific reason (postnatal visit or second stage)
 */
async function checkAndUpdateToPostnatalCare(patientId, reason = 'Postnatal activity') {
  try {
    // Check current patient status
    const patientDoc = await firebase.firestore()
      .collection('patients')
      .doc(patientId)
      .get();
    
    if (!patientDoc.exists) {
      console.error('Patient not found:', patientId);
      return false;
    }
    
    const currentStatus = patientDoc.data().status;
    
    // Update if patient is not already in postnatal care
    if (currentStatus !== PATIENT_STATUSES.POSTNATAL) {
      return await updatePatientStatus(
        patientId, 
        PATIENT_STATUSES.POSTNATAL, 
        reason
      );
    }
    
    console.log(`Patient status is already ${currentStatus}, no update needed`);
    return true;
  } catch (error) {
    console.error('Error checking postnatal care status:', error);
    return false;
  }
}

/**
 * Get current patient status
 * @param {string} patientId - Patient document ID
 * @returns {Promise<string|null>} Current status or null if error
 */
async function getPatientStatus(patientId) {
  try {
    const patientDoc = await firebase.firestore()
      .collection('patients')
      .doc(patientId)
      .get();
    
    if (!patientDoc.exists) {
      console.error('Patient not found:', patientId);
      return null;
    }
    
    return patientDoc.data().status || PATIENT_STATUSES.REGISTERED;
  } catch (error) {
    console.error('Error getting patient status:', error);
    return null;
  }
}

/**
 * Get status display name for UI
 * @param {string} status - Status value
 * @returns {string} Display name
 */
function getStatusDisplayName(status) {
  switch (status) {
    case PATIENT_STATUSES.REGISTERED:
      return 'Registered';
    case PATIENT_STATUSES.ANTENATAL:
      return 'Antenatal Care';
    case PATIENT_STATUSES.LABOUR:
      return 'Labour Care';
    case PATIENT_STATUSES.POSTNATAL:
      return 'Postnatal Care';
    default:
      return status || 'Unknown';
  }
}

/**
 * Get status badge class for styling
 * @param {string} status - Status value
 * @returns {string} CSS class name
 */
function getStatusBadgeClass(status) {
  switch (status) {
    case PATIENT_STATUSES.REGISTERED:
      return 'badge bg-secondary';
    case PATIENT_STATUSES.ANTENATAL:
      return 'badge bg-success';
    case PATIENT_STATUSES.LABOUR:
      return 'badge bg-danger';
    case PATIENT_STATUSES.POSTNATAL:
      return 'badge bg-info';
    default:
      return 'badge bg-secondary';
  }
}

// Export functions for use in other files
window.StatusManager = {
  updatePatientStatus,
  checkAndUpdateToAntenatalCare,
  checkAndUpdateToLabourCare,
  checkAndUpdateToPostnatalCare,
  getPatientStatus,
  getStatusDisplayName,
  getStatusBadgeClass,
  STATUSES: PATIENT_STATUSES
};
