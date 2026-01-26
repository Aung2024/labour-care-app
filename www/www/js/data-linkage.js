/**
 * Data Linkage Manager
 * Ensures patient data is properly linked across forms and modules
 * Auto-populates fields from patient record and previous visits
 */

/**
 * Load patient data and populate form fields
 * @param {string} patientId - Patient ID
 * @param {Object} options - Options for loading
 * @returns {Promise<Object>} Patient data
 */
async function loadPatientDataForForm(patientId, options = {}) {
  const {
    includeVisits = false,
    includeLatestANC = false,
    includeLatestPNC = false
  } = options;
  
  try {
    const db = firebase.firestore();
    
    // Load patient document
    const patientDoc = await db.collection('patients').doc(patientId).get();
    
    if (!patientDoc.exists) {
      throw new Error('Patient not found');
    }
    
    const patientData = {
      id: patientDoc.id,
      ...patientDoc.data()
    };
    
    // Load latest ANC visit if requested
    if (includeLatestANC || includeVisits) {
      try {
        const ancVisitsSnapshot = await db.collection('patients')
          .doc(patientId)
          .collection('antenatal_visits')
          .orderBy('visitDate', 'desc')
          .limit(1)
          .get();
        
        if (!ancVisitsSnapshot.empty) {
          patientData.latestANCVisit = ancVisitsSnapshot.docs[0].data();
        }
      } catch (error) {
        console.warn('Error loading ANC visits:', error);
      }
    }
    
    // Load latest PNC visit if requested
    if (includeLatestPNC || includeVisits) {
      try {
        const pncVisitsSnapshot = await db.collection('patients')
          .doc(patientId)
          .collection('postpartum_visits')
          .orderBy('visitDate', 'desc')
          .limit(1)
          .get();
        
        if (!pncVisitsSnapshot.empty) {
          patientData.latestPNCVisit = pncVisitsSnapshot.docs[0].data();
        }
      } catch (error) {
        console.warn('Error loading PNC visits:', error);
      }
    }
    
    return patientData;
  } catch (error) {
    console.error('Error loading patient data:', error);
    throw error;
  }
}

/**
 * Update patient document with key data from forms
 * This ensures data is linked across modules
 * @param {string} patientId - Patient ID
 * @param {Object} updates - Data to update
 */
async function updatePatientRecord(patientId, updates) {
  try {
    const db = firebase.firestore();
    
    // Only update fields that are provided and not null
    const cleanUpdates = {};
    Object.keys(updates).forEach(key => {
      if (updates[key] !== null && updates[key] !== undefined) {
        cleanUpdates[key] = updates[key];
      }
    });
    
    // Add lastUpdated timestamp
    cleanUpdates.lastUpdated = firebase.firestore.FieldValue.serverTimestamp();
    
    await db.collection('patients').doc(patientId).update(cleanUpdates);
    
    console.log('✅ Patient record updated:', Object.keys(cleanUpdates));
  } catch (error) {
    console.error('Error updating patient record:', error);
    throw error;
  }
}

/**
 * Auto-populate form fields from patient data
 * @param {Object} patientData - Patient data object
 * @param {Object} fieldMapping - Map of patient fields to form field IDs
 */
function autoPopulateFormFields(patientData, fieldMapping) {
  Object.keys(fieldMapping).forEach(patientField => {
    const formFieldId = fieldMapping[patientField];
    const formField = document.getElementById(formFieldId);
    
    if (formField && patientData[patientField] !== undefined && patientData[patientField] !== null) {
      // Handle date fields
      if (formField.type === 'date') {
        let dateValue = patientData[patientField];
        if (dateValue && typeof dateValue.toDate === 'function') {
          dateValue = dateValue.toDate().toISOString().split('T')[0];
        } else if (dateValue && typeof dateValue === 'string') {
          dateValue = dateValue.split('T')[0];
        }
        formField.value = dateValue || '';
      } else {
        formField.value = patientData[patientField];
      }
      
      // Trigger change event if needed
      if (formField.onchange) {
        formField.onchange();
      }
    }
  });
}

/**
 * Get unified patient summary
 * Aggregates data from all modules (registration, ANC, labour, PNC, baby)
 * @param {string} patientId - Patient ID
 * @returns {Promise<Object>} Unified patient summary
 */
async function getUnifiedPatientSummary(patientId) {
  try {
    const db = firebase.firestore();
    
    // Load patient document
    const patientDoc = await db.collection('patients').doc(patientId).get();
    if (!patientDoc.exists) {
      throw new Error('Patient not found');
    }
    
    const summary = {
      patient: {
        id: patientDoc.id,
        ...patientDoc.data()
      },
      antenatal: {
        visits: [],
        latestVisit: null,
        totalVisits: 0
      },
      labour: {
        records: [],
        latestRecord: null
      },
      postnatal: {
        visits: [],
        latestVisit: null,
        totalVisits: 0
      },
      baby: {
        records: [],
        latestRecord: null
      }
    };
    
    // Load ANC visits
    try {
      const ancVisitsSnapshot = await db.collection('patients')
        .doc(patientId)
        .collection('antenatal_visits')
        .orderBy('visitDate', 'desc')
        .get();
      
      summary.antenatal.visits = ancVisitsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      summary.antenatal.totalVisits = ancVisitsSnapshot.size;
      summary.antenatal.latestVisit = summary.antenatal.visits[0] || null;
    } catch (error) {
      console.warn('Error loading ANC visits:', error);
    }
    
    // Load labour care records
    try {
      const labourSnapshot = await db.collection('patients')
        .doc(patientId)
        .collection('records')
        .where('type', '==', 'labour')
        .orderBy('timestamp', 'desc')
        .get();
      
      summary.labour.records = labourSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      summary.labour.latestRecord = summary.labour.records[0] || null;
    } catch (error) {
      console.warn('Error loading labour records:', error);
    }
    
    // Load PNC visits
    try {
      const pncVisitsSnapshot = await db.collection('patients')
        .doc(patientId)
        .collection('postpartum_visits')
        .orderBy('visitDate', 'desc')
        .get();
      
      summary.postnatal.visits = pncVisitsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      summary.postnatal.totalVisits = pncVisitsSnapshot.size;
      summary.postnatal.latestVisit = summary.postnatal.visits[0] || null;
    } catch (error) {
      console.warn('Error loading PNC visits:', error);
    }
    
    // Load baby records
    try {
      const babySnapshot = await db.collection('patients')
        .doc(patientId)
        .collection('baby_records')
        .orderBy('birthDate', 'desc')
        .get();
      
      summary.baby.records = babySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      summary.baby.latestRecord = summary.baby.records[0] || null;
    } catch (error) {
      console.warn('Error loading baby records:', error);
    }
    
    return summary;
  } catch (error) {
    console.error('Error getting unified patient summary:', error);
    throw error;
  }
}

/**
 * Ensure LMP/EDD are saved to patient document
 * Called after ANC visit save to maintain linkage
 * @param {string} patientId - Patient ID
 * @param {string} lmp - LMP date
 * @param {string} edd - EDD date
 */
async function syncLMPEDDToPatient(patientId, lmp, edd) {
  if (!lmp && !edd) {
    return; // Nothing to sync
  }
  
  const updates = {};
  if (lmp) updates.lmp = lmp;
  if (edd) updates.edd = edd;
  
  await updatePatientRecord(patientId, updates);
  console.log('✅ LMP/EDD synced to patient record');
}

// Export functions
window.DataLinkage = {
  loadPatientData: loadPatientDataForForm,
  updatePatientRecord: updatePatientRecord,
  autoPopulateFields: autoPopulateFormFields,
  getUnifiedSummary: getUnifiedPatientSummary,
  syncLMPEDD: syncLMPEDDToPatient
};

console.log('✅ Data Linkage Manager initialized');

