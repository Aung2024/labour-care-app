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
    const consentDoc = await firebase.firestore()
      .collection('provider_consents')
      .doc(userId)
      .get();
    
    if (!consentDoc.exists) {
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
    
    await firebase.firestore()
      .collection('provider_consents')
      .doc(userId)
      .set(consentData);
    
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
    const consentDoc = await firebase.firestore()
      .collection('patients')
      .doc(patientId)
      .collection('consents')
      .doc('patient_consent')
      .get();
    
    if (!consentDoc.exists) {
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
    
    await firebase.firestore()
      .collection('patients')
      .doc(patientId)
      .collection('consents')
      .doc('patient_consent')
      .set(consentRecord);
    
    // Also update patient document with consent status
    await firebase.firestore()
      .collection('patients')
      .doc(patientId)
      .update({
        hasConsent: consentData.type !== 'refused',
        consentStatus: consentData.type === 'refused' ? 'no_consent' : 'consented',
        consentDate: firebase.firestore.FieldValue.serverTimestamp()
      });
    
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
    // Try to get IP from a public service
    const response = await fetch('https://api.ipify.org?format=json');
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

