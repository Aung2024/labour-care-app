/**
 * Consent Management Utility
 * Handles provider and patient consent storage, validation, and re-consent logic
 */

const CONSENT_VERSION = '1.0'; // Update this when consent text changes
const PROVIDER_RE_CONSENT_DAYS = 90; // 3 months

/**
 * Check if provider has given consent
 * @param {string} userId - User ID
 * @returns {Promise<{hasConsent: boolean, needsReconsent: boolean, consentData: object|null}>}
 */
async function checkProviderConsent(userId) {
  try {
    const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent || "");
    const consentQuery = firebase.firestore()
      .collection('provider_consents')
      .doc(userId);
    
    // Use smartFirestoreQuery for iOS compatibility
    const consentDoc = await smartFirestoreQuery(
      Promise.resolve(consentQuery),
      { 
        preferCache: isIOS, 
        timeout: 8000, 
        retries: 2, 
        fallbackToCache: true 
      }
    );
    
    if (!consentDoc || !consentDoc.exists) {
      return { hasConsent: false, needsReconsent: false, consentData: null };
    }
    
    const consentData = consentDoc.data();
    const consentDate = consentData.timestamp?.toDate ? consentData.timestamp.toDate() : new Date(consentData.timestamp);
    const daysSinceConsent = Math.floor((new Date() - consentDate) / (1000 * 60 * 60 * 24));
    
    const needsReconsent = daysSinceConsent >= PROVIDER_RE_CONSENT_DAYS || 
                           consentData.version !== CONSENT_VERSION;
    
    return {
      hasConsent: true,
      needsReconsent: needsReconsent,
      consentData: consentData
    };
  } catch (error) {
    console.error('Error checking provider consent:', error);
    return { hasConsent: false, needsReconsent: false, consentData: null };
  }
}

/**
 * Save provider consent
 * @param {string} userId - User ID
 * @param {string} userEmail - User email
 * @param {string} ipAddress - IP address (optional)
 * @returns {Promise<boolean>}
 */
async function saveProviderConsent(userId, userEmail, ipAddress = null) {
  try {
    const consentData = {
      userId: userId,
      userEmail: userEmail,
      version: CONSENT_VERSION,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      ipAddress: ipAddress,
      deviceInfo: navigator.userAgent || 'Unknown'
    };
    
    // Use Promise.race with timeout for iOS compatibility
    const savePromise = firebase.firestore()
      .collection('provider_consents')
      .doc(userId)
      .set(consentData);
    
    await Promise.race([
      savePromise,
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Save timeout')), 10000)
      )
    ]);
    
    console.log('✅ Provider consent saved successfully');
    return true;
  } catch (error) {
    console.error('Error saving provider consent:', error);
    return false;
  }
}

/**
 * Check if patient has given consent
 * @param {string} patientId - Patient ID
 * @returns {Promise<{hasConsent: boolean, consentData: object|null}>}
 */
async function checkPatientConsent(patientId) {
  try {
    const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent || "");
    const consentQuery = firebase.firestore()
      .collection('patients')
      .doc(patientId)
      .collection('consents')
      .doc('patient_consent');
    
    // Use smartFirestoreQuery for iOS compatibility
    const consentDoc = await smartFirestoreQuery(
      Promise.resolve(consentQuery),
      { 
        preferCache: isIOS, 
        timeout: 8000, 
        retries: 2, 
        fallbackToCache: true 
      }
    );
    
    if (!consentDoc || !consentDoc.exists) {
      return { hasConsent: false, consentData: null };
    }
    
    return {
      hasConsent: true,
      consentData: consentDoc.data()
    };
  } catch (error) {
    console.error('Error checking patient consent:', error);
    return { hasConsent: false, consentData: null };
  }
}

/**
 * Save patient consent
 * @param {string} patientId - Patient ID
 * @param {string} providerId - Provider/User ID who collected consent
 * @param {string} providerName - Provider name
 * @param {object} consentData - Consent data (signature, verbal, etc.)
 * @returns {Promise<boolean>}
 */
async function savePatientConsent(patientId, providerId, providerName, consentData) {
  try {
    const consentRecord = {
      patientId: patientId,
      providerId: providerId,
      providerName: providerName,
      version: CONSENT_VERSION,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      consentType: consentData.type || 'digital', // 'digital', 'verbal', 'refused'
      signature: consentData.signature || null, // Base64 image or null
      patientName: consentData.patientName || null,
      verbalConsent: consentData.verbalConsent || false,
      providerAttestation: consentData.providerAttestation || null,
      facility: consentData.facility || null,
      ipAddress: consentData.ipAddress || null,
      deviceInfo: navigator.userAgent || 'Unknown'
    };
    
    // Use Promise.race with timeout for iOS compatibility
    const saveConsentPromise = firebase.firestore()
      .collection('patients')
      .doc(patientId)
      .collection('consents')
      .doc('patient_consent')
      .set(consentRecord);
    
    await Promise.race([
      saveConsentPromise,
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Save consent timeout')), 10000)
      )
    ]);
    
    // Also update patient document with consent status
    const updatePatientPromise = firebase.firestore()
      .collection('patients')
      .doc(patientId)
      .update({
        hasConsent: consentData.type !== 'refused',
        consentStatus: consentData.type === 'refused' ? 'no_consent' : 'consented',
        consentDate: firebase.firestore.FieldValue.serverTimestamp()
      });
    
    await Promise.race([
      updatePatientPromise,
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Update patient timeout')), 10000)
      )
    ]);
    
    console.log('✅ Patient consent saved successfully');
    return true;
  } catch (error) {
    console.error('Error saving patient consent:', error);
    return false;
  }
}

/**
 * Get IP address (client-side approximation)
 * @returns {Promise<string|null>}
 */
async function getClientIP() {
  try {
    // Try to get IP from a public service with timeout for iOS
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
    
    const response = await fetch('https://api.ipify.org?format=json', {
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    
    const data = await response.json();
    return data.ip || null;
  } catch (error) {
    console.log('Could not fetch IP address:', error);
    return null;
  }
}

// Export functions
window.ConsentManager = {
  checkProviderConsent,
  saveProviderConsent,
  checkPatientConsent,
  savePatientConsent,
  getClientIP,
  CONSENT_VERSION,
  PROVIDER_RE_CONSENT_DAYS
};

