/**
 * Duplicate Patient Detection
 * Detects potential duplicate patients by phone number and name/age similarity
 */

/**
 * Search for duplicate patients by phone number
 * @param {string} phoneNumber - Phone number to search
 * @param {object} options - Options for filtering (userRole, userId, township)
 * @returns {Promise<Array>} Array of potential duplicate patients
 */
async function searchDuplicatesByPhone(phoneNumber, options = {}) {
  try {
    if (!phoneNumber || phoneNumber.trim() === '') {
    return [];
  }
  
    // Normalize phone number (remove spaces, dashes, etc.)
    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    if (!normalizedPhone) {
      return [];
    }
    
    const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent || "");
    const db = firebase.firestore();
    
    // Build base queries with role-based filtering
    let baseQueries = [];
    
    if (options.userRole === 'Midwife' && options.userId) {
      // Midwife: only check patients they created
      baseQueries = [
        db.collection('patients')
          .where('phone', '==', normalizedPhone)
          .where('created_by', '==', options.userId),
        db.collection('patients')
          .where('phoneNumber', '==', normalizedPhone)
          .where('created_by', '==', options.userId),
        db.collection('patients')
          .where('phone_number', '==', normalizedPhone)
          .where('created_by', '==', options.userId),
        // Also check old format
        db.collection('patients')
          .where('phone', '==', normalizedPhone)
          .where('createdBy', '==', options.userId),
        db.collection('patients')
          .where('phoneNumber', '==', normalizedPhone)
          .where('createdBy', '==', options.userId)
      ];
    } else if (options.userRole === 'TMO' && options.township) {
      // TMO: only check patients in their township
      baseQueries = [
        db.collection('patients')
          .where('phone', '==', normalizedPhone)
          .where('township', '==', options.township),
        db.collection('patients')
          .where('phoneNumber', '==', normalizedPhone)
          .where('township', '==', options.township),
        db.collection('patients')
          .where('phone_number', '==', normalizedPhone)
          .where('township', '==', options.township)
      ];
    } else {
      // Super Admin or no role: check all patients
      baseQueries = [
        db.collection('patients').where('phone', '==', normalizedPhone),
        db.collection('patients').where('phoneNumber', '==', normalizedPhone),
        db.collection('patients').where('phone_number', '==', normalizedPhone)
      ];
    }
    
    const allMatches = [];
    const seenIds = new Set();
    
    for (const query of baseQueries) {
      try {
        const snapshot = await smartFirestoreQuery(
      Promise.resolve(query),
          { preferCache: isIOS, timeout: 8000, retries: 2, fallbackToCache: true }
        );
        
        if (snapshot && !snapshot.empty) {
          snapshot.forEach(doc => {
            if (!seenIds.has(doc.id)) {
              seenIds.add(doc.id);
              allMatches.push({
                id: doc.id,
                ...doc.data()
              });
            }
          });
        }
      } catch (error) {
        console.warn('Error searching phone duplicates:', error);
        // Continue with other queries
      }
    }
    
    return allMatches;
  } catch (error) {
    console.error('Error in searchDuplicatesByPhone:', error);
    return [];
  }
}

/**
 * Search for duplicate patients by name and age
 * @param {string} name - Patient name
 * @param {number} age - Patient age
 * @param {number} ageTolerance - Age difference tolerance (default: 2 years)
 * @param {object} filterCriteria - Role-based filter criteria
 * @returns {Promise<Array>} Array of potential duplicate patients
 */
async function searchDuplicatesByNameAge(name, age, ageTolerance = 2, filterCriteria = null) {
  try {
    if (!name || name.trim() === '') {
      return [];
    }
    
    if (!age || isNaN(age)) {
    return [];
  }
  
    const normalizedName = normalizeName(name);
    if (!normalizedName) {
    return [];
  }
  
    const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent || "");
    const db = firebase.firestore();
    
    // Calculate age range
    const minAge = age - ageTolerance;
    const maxAge = age + ageTolerance;
    
    // Build query with role-based filtering
    let query = db.collection('patients');
    
    if (filterCriteria) {
      if (filterCriteria.type === 'created_by') {
        // Midwife: filter by created_by (try both field names)
        try {
          const newQuery = query.where('created_by', '==', filterCriteria.value);
          const oldQuery = query.where('createdBy', '==', filterCriteria.value);
          
          // Get both queries
          const [newSnap, oldSnap] = await Promise.all([
            smartFirestoreQuery(Promise.resolve(newQuery), { preferCache: isIOS, timeout: 10000, retries: 2, fallbackToCache: true }),
            smartFirestoreQuery(Promise.resolve(oldQuery), { preferCache: isIOS, timeout: 10000, retries: 2, fallbackToCache: true })
          ]);
          
          // Combine results
          const allPatients = [];
          const seenIds = new Set();
          
          if (newSnap && !newSnap.empty) {
            newSnap.forEach(doc => {
              if (!seenIds.has(doc.id)) {
                seenIds.add(doc.id);
                allPatients.push({ id: doc.id, ...doc.data() });
              }
            });
          }
          
          if (oldSnap && !oldSnap.empty) {
            oldSnap.forEach(doc => {
              if (!seenIds.has(doc.id)) {
                seenIds.add(doc.id);
                allPatients.push({ id: doc.id, ...doc.data() });
              }
            });
          }
          
          // Filter by age and name similarity
          return filterPatientsByNameAge(allPatients, normalizedName, minAge, maxAge);
        } catch (error) {
          console.warn('Error fetching patients for name/age search:', error);
          return [];
        }
      } else if (filterCriteria.type === 'township') {
        // TMO: filter by township
        query = query.where('township', '==', filterCriteria.value);
      }
    }
    
    // For Super Admin or TMO, get all matching patients
    let allPatients = [];
    try {
      const snapshot = await smartFirestoreQuery(
        Promise.resolve(query),
      { preferCache: isIOS, timeout: 10000, retries: 2, fallbackToCache: true }
    );
    
      if (snapshot && !snapshot.empty) {
        snapshot.forEach(doc => {
          allPatients.push({
            id: doc.id,
            ...doc.data()
          });
        });
      }
    } catch (error) {
      console.warn('Error fetching patients for name/age search:', error);
      return [];
    }
    
    // Filter by age and name similarity
    return filterPatientsByNameAge(allPatients, normalizedName, minAge, maxAge);
  } catch (error) {
    console.error('Error in searchDuplicatesByNameAge:', error);
    return [];
  }
}

/**
 * Filter patients by name similarity and age range
 * @param {Array} patients - Array of patient objects
 * @param {string} normalizedName - Normalized search name
 * @param {number} minAge - Minimum age
 * @param {number} maxAge - Maximum age
 * @returns {Array} Filtered patients
 */
function filterPatientsByNameAge(patients, normalizedName, minAge, maxAge) {
  console.log('🔎 Filtering patients by name/age:', { 
    searchName: normalizedName, 
    ageRange: `${minAge}-${maxAge}`, 
    totalPatients: patients.length 
  });
  
  const matches = patients.filter(patient => {
    // Check age match
    const patientAge = patient.age || patient.patientAge;
    if (!patientAge || isNaN(patientAge)) {
      return false;
    }
    
    if (patientAge < minAge || patientAge > maxAge) {
      return false;
    }
    
    // Check name - EXACT MATCH ONLY (no similarity threshold)
    const patientName = patient.name || patient.patientName || '';
    const normalizedPatientName = normalizeName(patientName);
    
    if (!normalizedPatientName) {
      return false;
    }
    
    // Only match if names are exactly the same (after normalization)
    const isExactMatch = normalizedName === normalizedPatientName;
    
    if (isExactMatch) {
      console.log('✅ Exact name match found:', { 
        searchName: normalizedName, 
        patientName: normalizedPatientName, 
        patientId: patient.id,
        patientAge: patientAge
      });
    }
    
    return isExactMatch;
  });
  
  console.log('🔎 Name/age filtering complete:', { matches: matches.length });
  return matches;
}

/**
 * Normalize phone number (remove spaces, dashes, etc.)
 */
function normalizePhoneNumber(phone) {
  if (!phone) return '';
  // Remove all non-digit characters except +
  return phone.replace(/[^\d+]/g, '').trim();
}

/**
 * Normalize name for comparison (lowercase, remove extra spaces)
 */
function normalizeName(name) {
  if (!name) return '';
  return name.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Calculate name similarity (0-1 scale)
 * Simple implementation using character matching
 */
function calculateNameSimilarity(name1, name2) {
  if (!name1 || !name2) return 0;
  
  const words1 = name1.split(' ');
  const words2 = name2.split(' ');
  
  // Check if names are exactly the same
  if (name1 === name2) return 1.0;
  
  // Check if all words match (order doesn't matter)
  const allWordsMatch = words1.every(w => words2.includes(w)) && 
                        words2.every(w => words1.includes(w));
  if (allWordsMatch) return 0.95;
  
  // Check for partial word matches
  let matchingWords = 0;
  words1.forEach(w1 => {
    if (words2.some(w2 => w1 === w2 || w1.includes(w2) || w2.includes(w1))) {
      matchingWords++;
    }
  });
  
  const similarity = matchingWords / Math.max(words1.length, words2.length);
  return similarity;
}

/**
 * Check for duplicate patients (combines phone and name/age search)
 * @param {object} patientData - Patient data object
 * @param {object} options - Options for filtering (userRole, userId, township)
 * @returns {Promise<{hasDuplicates: boolean, duplicates: Array, phoneMatches: Array, nameMatches: Array}>}
 */
async function checkForDuplicates(patientData, options = {}) {
  const phoneNumber = patientData.phone || patientData.phoneNumber || patientData.phone_number;
  const name = patientData.name || patientData.patientName;
  const age = patientData.age || patientData.patientAge;
  
  console.log('🔍 Duplicate check started:', { name, age, phoneNumber, options });
  
  const results = {
    hasDuplicates: false,
    duplicates: [],
    phoneMatches: [],
    nameMatches: []
  };
  
  // Search by phone number
  if (phoneNumber) {
    console.log('📞 Searching for phone duplicates:', phoneNumber);
    results.phoneMatches = await searchDuplicatesByPhone(phoneNumber, options);
    console.log('📞 Phone matches found:', results.phoneMatches.length, results.phoneMatches);
  }
  
  // Search by name and age
  if (name && age) {
    // Convert options to filterCriteria format
    let filterCriteria = null;
    if (options.userRole === 'Midwife' && options.userId) {
      filterCriteria = { type: 'created_by', value: options.userId };
    } else if (options.userRole === 'TMO' && options.township) {
      filterCriteria = { type: 'township', value: options.township };
    }
    // Super Admin: filterCriteria remains null (check all patients)
    
    console.log('👤 Searching for name/age duplicates:', { name, age, filterCriteria });
    results.nameMatches = await searchDuplicatesByNameAge(name, age, 2, filterCriteria);
    console.log('👤 Name/age matches found:', results.nameMatches.length, results.nameMatches);
  }
  
  // Combine and deduplicate
  const allDuplicates = [...results.phoneMatches, ...results.nameMatches];
  const uniqueDuplicates = [];
  const seenIds = new Set();
  
  allDuplicates.forEach(dup => {
    if (!seenIds.has(dup.id)) {
      seenIds.add(dup.id);
      uniqueDuplicates.push(dup);
    }
  });
  
  results.duplicates = uniqueDuplicates;
  results.hasDuplicates = uniqueDuplicates.length > 0;
  
  console.log('✅ Duplicate check complete:', { 
    hasDuplicates: results.hasDuplicates, 
    totalDuplicates: uniqueDuplicates.length,
    duplicates: uniqueDuplicates.map(d => ({ id: d.id, name: d.name || d.patientName, age: d.age || d.patientAge }))
  });
  
  return results;
}

/**
 * Display duplicate warning modal
 * @param {Array} duplicates - Array of duplicate patients
 * @param {Function} onLink - Callback when user chooses to link to existing patient
 * @param {Function} onContinue - Callback when user chooses to continue with new patient
 */
function showDuplicateWarning(duplicates, onLink, onContinue) {
  // Create modal HTML
  const modalHTML = `
    <div id="duplicateWarningModal" style="
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1rem;
    ">
      <div style="
        background: white;
        border-radius: 12px;
        padding: 2rem;
        max-width: 600px;
        width: 100%;
        max-height: 80vh;
        overflow-y: auto;
        box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      ">
        <h3 style="color: #dc2626; margin-bottom: 1rem;">
          <i class="fas fa-exclamation-triangle"></i> Potential Duplicate Patient Found
        </h3>
        <p style="margin-bottom: 1.5rem; color: #6b7280;">
          We found ${duplicates.length} patient record(s) that may be duplicates. Please review and choose an option:
        </p>
        
        <div style="margin-bottom: 1.5rem; max-height: 300px; overflow-y: auto;">
          ${duplicates.map((dup, index) => `
            <div style="
              border: 1px solid #e5e7eb;
              border-radius: 8px;
              padding: 1rem;
              margin-bottom: 0.5rem;
              background: #f9fafb;
            ">
              <div style="font-weight: 600; margin-bottom: 0.5rem;">
                ${dup.name || dup.patientName || 'Unknown'} (Age: ${dup.age || dup.patientAge || 'N/A'})
              </div>
              <div style="font-size: 0.875rem; color: #6b7280;">
                Phone: ${dup.phone || dup.phoneNumber || 'N/A'}<br>
                Patient ID: ${dup.id || 'N/A'}<br>
                Registered: ${dup.createdAt ? new Date(dup.createdAt.seconds * 1000).toLocaleDateString() : 'N/A'}
              </div>
              <button onclick="linkToPatient('${dup.id}')" style="
                margin-top: 0.5rem;
                padding: 0.5rem 1rem;
                background: #2563eb;
                color: white;
                border: none;
                border-radius: 6px;
                cursor: pointer;
                font-weight: 600;
              ">
                Use This Patient
              </button>
            </div>
          `).join('')}
        </div>
        
        <div style="display: flex; gap: 1rem; justify-content: flex-end;">
          <button onclick="continueWithNewPatient()" style="
            padding: 0.75rem 1.5rem;
            background: #10b981;
            color: white;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-weight: 600;
          ">
            Create New Patient
          </button>
        </div>
      </div>
    </div>
  `;
  
  // Add modal to page
  const modalDiv = document.createElement('div');
  modalDiv.innerHTML = modalHTML;
  document.body.appendChild(modalDiv);
  
  // Add global functions for buttons
  window.linkToPatient = (patientId) => {
    document.body.removeChild(modalDiv);
    if (onLink) {
      onLink(patientId);
    }
  };
  
  window.continueWithNewPatient = () => {
    // Show justification prompt
    const justification = prompt('Please provide a reason for creating a new patient record (required):');
    if (!justification || justification.trim() === '') {
      alert('Justification is required to create a new patient record.');
    return;
  }
  
    document.body.removeChild(modalDiv);
    if (onContinue) {
      onContinue(justification);
    }
  };
}

/**
 * Log duplicate check result to audit log
 * @param {string} action - Action type ('checked', 'linked', 'created_new')
 * @param {Object} patientData - Patient data that was checked
 * @param {Array} duplicates - Array of duplicate matches found
 * @param {string} outcome - Outcome ('no_duplicates', 'linked', 'created_with_justification')
 */
async function logDuplicateCheck(action, patientData, duplicates = [], outcome = 'no_duplicates') {
  try {
    if (window.AuditLogger) {
      await window.AuditLogger.logAuditEvent({
        action: `duplicate_check_${action}`,
        resource: 'patient_registration',
        details: {
          patientName: patientData.name,
          patientAge: patientData.age,
          patientPhone: patientData.phone,
          duplicatesFound: duplicates.length,
          duplicateIds: duplicates.map(d => d.id),
          outcome: outcome
        }
      });
    }
    console.log(`📝 Duplicate check logged: ${action} - ${outcome}`);
  } catch (error) {
    console.warn('Error logging duplicate check:', error);
    // Non-critical, don't throw
  }
}

// Export functions
window.DuplicateDetector = {
  check: checkForDuplicates,
  searchByPhone: searchDuplicatesByPhone,
  searchByNameAge: searchDuplicatesByNameAge,
  showWarning: showDuplicateWarning,
  logCheck: logDuplicateCheck
};

console.log('✅ Duplicate Detector initialized');
