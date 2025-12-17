/**
 * Duplicate Patient Detection
 * Detects potential duplicate patients by phone number and name/age similarity
 */

/**
 * Search for duplicate patients by phone number
 * @param {string} phoneNumber - Phone number to search
 * @returns {Promise<Array>} Array of potential duplicate patients
 */
async function searchDuplicatesByPhone(phoneNumber) {
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
    
    // Search for patients with same phone number
    // Try different field names for compatibility
    const queries = [
      db.collection('patients').where('phone', '==', normalizedPhone),
      db.collection('patients').where('phoneNumber', '==', normalizedPhone),
      db.collection('patients').where('phone_number', '==', normalizedPhone)
    ];
    
    const allMatches = [];
    const seenIds = new Set();
    
    for (const query of queries) {
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
 * @returns {Promise<Array>} Array of potential duplicate patients
 */
async function searchDuplicatesByNameAge(name, age, ageTolerance = 2) {
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
    
    // Get all patients (we'll filter by name similarity in memory)
    // This is less efficient but necessary for fuzzy name matching
    let allPatients = [];
    try {
      const snapshot = await smartFirestoreQuery(
        Promise.resolve(db.collection('patients')),
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
    
    // Filter by name similarity and age
    const matches = allPatients.filter(patient => {
      // Check age match
      const patientAge = patient.age || patient.patientAge;
      if (!patientAge || isNaN(patientAge)) {
        return false;
      }
      
      if (patientAge < minAge || patientAge > maxAge) {
        return false;
      }
      
      // Check name similarity
      const patientName = patient.name || patient.patientName || '';
      const normalizedPatientName = normalizeName(patientName);
      
      if (!normalizedPatientName) {
        return false;
      }
      
      // Calculate similarity (simple Levenshtein-like check)
      const similarity = calculateNameSimilarity(normalizedName, normalizedPatientName);
      
      // Consider it a match if similarity is > 80%
      return similarity > 0.8;
    });
    
    return matches;
  } catch (error) {
    console.error('Error in searchDuplicatesByNameAge:', error);
    return [];
  }
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
 * @returns {Promise<{hasDuplicates: boolean, duplicates: Array, phoneMatches: Array, nameMatches: Array}>}
 */
async function checkForDuplicates(patientData) {
  const phoneNumber = patientData.phone || patientData.phoneNumber || patientData.phone_number;
  const name = patientData.name || patientData.patientName;
  const age = patientData.age || patientData.patientAge;
  
  const results = {
    hasDuplicates: false,
    duplicates: [],
    phoneMatches: [],
    nameMatches: []
  };
  
  // Search by phone number
  if (phoneNumber) {
    results.phoneMatches = await searchDuplicatesByPhone(phoneNumber);
  }
  
  // Search by name and age
  if (name && age) {
    results.nameMatches = await searchDuplicatesByNameAge(name, age);
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

// Export functions
window.DuplicateDetector = {
  check: checkForDuplicates,
  searchByPhone: searchDuplicatesByPhone,
  searchByNameAge: searchDuplicatesByNameAge,
  showWarning: showDuplicateWarning
};

console.log('✅ Duplicate Detector initialized');
