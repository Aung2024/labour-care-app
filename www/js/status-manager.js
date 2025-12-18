/**
 * Status Management Utility
 * Handles automatic patient status updates based on care activities
 */

// Status constants
const PATIENT_STATUSES = {
  REGISTERED: 'registered',
  ANTENATAL: 'antenatal_care', 
  IN_LABOUR: 'in_labour',
  BIRTHED: 'birthed',
  POSTNATAL: 'postnatal_care',
  ANC_TRANSFER: 'anc_transfer',
  LABOUR_TRANSFER: 'labour_transfer',
  PNC_TRANSFER: 'pnc_transfer'
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
 * Check if patient should be moved to In Labour status
 * Called when active first stage time is recorded in labour-care-setup.html or summary.html
 * @param {string} patientId - Patient document ID
 */
async function checkAndUpdateToInLabour(patientId) {
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
    
    // Update if patient is in "registered" or "antenatal_care" status (not if already transferred)
    if (currentStatus === PATIENT_STATUSES.REGISTERED || 
        currentStatus === PATIENT_STATUSES.ANTENATAL) {
      return await updatePatientStatus(
        patientId, 
        PATIENT_STATUSES.IN_LABOUR, 
        'Active first stage time recorded'
      );
    }
    
    console.log(`Patient status is already ${currentStatus}, no update needed`);
    return true;
  } catch (error) {
    console.error('Error checking in labour status:', error);
    return false;
  }
}

/**
 * Check if patient should be moved to Birthed status
 * Called when second stage time is recorded OR when immediate/newborn care data is saved
 * @param {string} patientId - Patient document ID
 * @param {string} reason - Specific reason (second stage time, immediate care, or newborn care)
 */
async function checkAndUpdateToBirthed(patientId, reason = 'Birth recorded') {
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
    
    // Update if patient is in "in_labour" status (not if already transferred or birthed)
    if (currentStatus === PATIENT_STATUSES.IN_LABOUR) {
      return await updatePatientStatus(
        patientId, 
        PATIENT_STATUSES.BIRTHED, 
        reason
      );
    }
    
    console.log(`Patient status is already ${currentStatus}, no update needed`);
    return true;
  } catch (error) {
    console.error('Error checking birthed status:', error);
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
 * Check if patient should be moved to Transfer status
 * Called when transfer data is saved from different forms
 * @param {string} patientId - Patient document ID
 * @param {string} transferType - Type of transfer: 'anc_transfer', 'labour_transfer', or 'pnc_transfer'
 * @param {string} reason - Reason for transfer
 */
async function checkAndUpdateToTransfer(patientId, transferType, reason = '') {
  try {
    // Validate transfer type
    const validTransferTypes = [
      PATIENT_STATUSES.ANC_TRANSFER,
      PATIENT_STATUSES.LABOUR_TRANSFER,
      PATIENT_STATUSES.PNC_TRANSFER
    ];
    
    if (!validTransferTypes.includes(transferType)) {
      console.error('Invalid transfer type:', transferType);
      return false;
    }
    
    // Check current patient status
    const patientDoc = await firebase.firestore()
      .collection('patients')
      .doc(patientId)
      .get();
    
    if (!patientDoc.exists) {
      console.error('Patient not found:', patientId);
      return false;
    }
    
    return await updatePatientStatus(
      patientId, 
      transferType, 
      reason || `Transferred during ${transferType.replace('_', ' ')}`
    );
  } catch (error) {
    console.error('Error updating transfer status:', error);
    return false;
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
    case PATIENT_STATUSES.IN_LABOUR:
      return 'In Labour';
    case PATIENT_STATUSES.BIRTHED:
      return 'Birthed';
    case PATIENT_STATUSES.POSTNATAL:
      return 'Postnatal Care';
    case PATIENT_STATUSES.ANC_TRANSFER:
      return 'ANC Transfer';
    case PATIENT_STATUSES.LABOUR_TRANSFER:
      return 'Labour Transfer';
    case PATIENT_STATUSES.PNC_TRANSFER:
      return 'PNC Transfer';
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
    case PATIENT_STATUSES.IN_LABOUR:
      return 'badge bg-danger';
    case PATIENT_STATUSES.BIRTHED:
      return 'badge bg-warning';
    case PATIENT_STATUSES.POSTNATAL:
      return 'badge bg-info';
    case PATIENT_STATUSES.ANC_TRANSFER:
    case PATIENT_STATUSES.LABOUR_TRANSFER:
    case PATIENT_STATUSES.PNC_TRANSFER:
      return 'badge bg-warning text-dark';
    default:
      return 'badge bg-secondary';
  }
}

// Export functions for use in other files
window.StatusManager = {
  updatePatientStatus,
  checkAndUpdateToAntenatalCare,
  checkAndUpdateToInLabour,
  checkAndUpdateToBirthed,
  checkAndUpdateToPostnatalCare,
  checkAndUpdateToTransfer,
  getPatientStatus,
  getStatusDisplayName,
  getStatusBadgeClass,
  STATUSES: PATIENT_STATUSES
};
