/**
 * Audit Logging Utility
 * Logs all critical operations for security and compliance
 */

// Audit log collection name
const AUDIT_COLLECTION = 'audit_logs';

// Action types
const AUDIT_ACTIONS = {
  // Authentication
  LOGIN: 'login',
  LOGOUT: 'logout',
  LOGIN_FAILED: 'login_failed',
  SESSION_TIMEOUT: 'session_timeout',
  PASSWORD_CHANGED: 'password_changed',
  ACCOUNT_LOCKED: 'account_locked',
  
  // Patient Operations
  PATIENT_CREATED: 'patient_created',
  PATIENT_UPDATED: 'patient_updated',
  PATIENT_DELETED: 'patient_deleted',
  PATIENT_VIEWED: 'patient_viewed',
  
  // Care Operations
  ANC_VISIT_CREATED: 'anc_visit_created',
  ANC_VISIT_UPDATED: 'anc_visit_updated',
  LABOUR_CARE_SAVED: 'labour_care_saved',
  PNC_VISIT_CREATED: 'pnc_visit_created',
  NEWBORN_CARE_SAVED: 'newborn_care_saved',
  
  // Status Changes
  STATUS_CHANGED: 'status_changed',
  TRANSFER_RECORDED: 'transfer_recorded',
  
  // Consent
  PROVIDER_CONSENT_GIVEN: 'provider_consent_given',
  PATIENT_CONSENT_GIVEN: 'patient_consent_given',
  CONSENT_REFUSED: 'consent_refused',
  
  // Settings
  SETTINGS_UPDATED: 'settings_updated',
  PROFILE_UPDATED: 'profile_updated',
  
  // Data Access
  REPORT_GENERATED: 'report_generated',
  DATA_EXPORTED: 'data_exported',
  
  // Security
  UNAUTHORIZED_ACCESS: 'unauthorized_access',
  SUSPICIOUS_ACTIVITY: 'suspicious_activity'
};

/**
 * Get client IP address (approximation)
 */
async function getClientIP() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    
    const response = await fetch('https://api.ipify.org?format=json', {
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    
    const data = await response.json();
    return data.ip || 'unknown';
  } catch (error) {
    console.log('Could not fetch IP address:', error);
    return 'unknown';
  }
}

/**
 * Get user agent information
 */
function getUserAgent() {
  return navigator.userAgent || 'unknown';
}

/**
 * Log an audit event
 * @param {Object} eventData - Event data to log
 * @param {string} eventData.action - Action type (from AUDIT_ACTIONS)
 * @param {string} eventData.resource - Resource type (e.g., 'patient', 'user', 'consent')
 * @param {string} eventData.resourceId - Resource ID (e.g., patient ID, user ID)
 * @param {string} eventData.details - Additional details
 * @param {Object} eventData.metadata - Additional metadata
 * @param {boolean} eventData.allowUnauthenticated - Allow logging without authentication (for failed login attempts)
 * @returns {Promise<boolean>} Success status
 */
async function logAuditEvent(eventData) {
  try {
    const user = firebase.auth().currentUser;
    const allowUnauthenticated = eventData.allowUnauthenticated || false;
    
    // Some events (like failed login) can be logged without authentication
    if (!user && !allowUnauthenticated) {
      // Skip quietly to avoid noisy console errors before login
      console.info('ℹ️ Audit log skipped (no authenticated user).');
      return false;
    }
    
    // Get user role
    let userRole = 'unknown';
    try {
      const userDoc = await firebase.firestore()
        .collection('users')
        .doc(user.uid)
        .get();
      if (userDoc.exists) {
        userRole = userDoc.data().role || 'unknown';
      }
    } catch (error) {
      console.warn('Could not fetch user role for audit log:', error);
    }
    
    // Get client IP
    const clientIP = await getClientIP();
    
    // Build audit log entry
    const auditEntry = {
      // User information (may be null for unauthenticated events)
      userId: user ? user.uid : (eventData.userId || 'unauthenticated'),
      userEmail: user ? (user.email || 'unknown') : (eventData.userEmail || 'unknown'),
      userRole: userRole,
      
      // Action information
      action: eventData.action || 'unknown',
      resource: eventData.resource || 'unknown',
      resourceId: eventData.resourceId || null,
      details: eventData.details || '',
      metadata: eventData.metadata || {},
      
      // Technical information
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      clientIP: clientIP,
      userAgent: getUserAgent(),
      
      // Session information
      sessionId: localStorage.getItem('sessionId') || 'unknown',
      deviceInfo: {
        platform: navigator.platform || 'unknown',
        language: navigator.language || 'unknown',
        screenResolution: `${window.screen.width}x${window.screen.height}` || 'unknown'
      },
      
      // Flag for unauthenticated events
      unauthenticated: !user
    };
    
    // Save to Firestore
    // For unauthenticated events, we need to use a different approach
    if (!user && allowUnauthenticated) {
      // For unauthenticated events, we can't use the normal security rules
      // We'll need to handle this differently - either skip logging or use a different collection
      // For now, we'll try to log it, but it may fail if rules don't allow it
      try {
        await firebase.firestore()
          .collection(AUDIT_COLLECTION)
          .add(auditEntry);
        console.log('✅ Audit log saved (unauthenticated):', eventData.action);
        return true;
      } catch (error) {
        // If it fails due to permissions, that's okay - we tried
        console.warn('⚠️ Could not log unauthenticated event (permissions):', error.message);
        return false;
      }
    } else {
      await firebase.firestore()
        .collection(AUDIT_COLLECTION)
        .add(auditEntry);
      console.log('✅ Audit log saved:', eventData.action);
      return true;
    }
    
  } catch (error) {
    console.error('❌ Error logging audit event:', error);
    // Don't throw error - audit logging should not break the app
    return false;
  }
}

/**
 * Log authentication events
 */
async function logLogin(userId, success = true, userEmail = null) {
  return await logAuditEvent({
    action: success ? AUDIT_ACTIONS.LOGIN : AUDIT_ACTIONS.LOGIN_FAILED,
    resource: 'authentication',
    resourceId: userId,
    details: success ? 'User logged in successfully' : 'Login attempt failed',
    allowUnauthenticated: !success, // Allow logging failed login attempts without auth
    userId: userId,
    userEmail: userEmail || userId // Use email if provided, otherwise use userId
  });
}

async function logLogout(userId) {
  return await logAuditEvent({
    action: AUDIT_ACTIONS.LOGOUT,
    resource: 'authentication',
    resourceId: userId,
    details: 'User logged out'
  });
}

/**
 * Log patient operations
 */
async function logPatientOperation(action, patientId, details = '') {
  return await logAuditEvent({
    action: action,
    resource: 'patient',
    resourceId: patientId,
    details: details
  });
}

/**
 * Log care operations
 */
async function logCareOperation(action, patientId, careType, details = '') {
  return await logAuditEvent({
    action: action,
    resource: 'care',
    resourceId: patientId,
    details: `${careType}: ${details}`,
    metadata: { careType: careType }
  });
}

/**
 * Log status changes
 */
async function logStatusChange(patientId, oldStatus, newStatus, reason = '') {
  return await logAuditEvent({
    action: AUDIT_ACTIONS.STATUS_CHANGED,
    resource: 'patient_status',
    resourceId: patientId,
    details: `Status changed from ${oldStatus} to ${newStatus}`,
    metadata: {
      oldStatus: oldStatus,
      newStatus: newStatus,
      reason: reason
    }
  });
}

/**
 * Log consent operations
 */
async function logConsentOperation(action, patientId, consentType, details = '') {
  return await logAuditEvent({
    action: action,
    resource: 'consent',
    resourceId: patientId,
    details: `${consentType}: ${details}`,
    metadata: { consentType: consentType }
  });
}

/**
 * Log security events
 */
async function logSecurityEvent(action, details = '', metadata = {}) {
  return await logAuditEvent({
    action: action,
    resource: 'security',
    resourceId: null,
    details: details,
    metadata: metadata
  });
}

/**
 * Log unauthorized access attempt
 */
async function logUnauthorizedAccess(resource, resourceId, attemptedAction) {
  return await logSecurityEvent(
    AUDIT_ACTIONS.UNAUTHORIZED_ACCESS,
    `Unauthorized access attempt: ${attemptedAction} on ${resource}`,
    {
      resource: resource,
      resourceId: resourceId,
      attemptedAction: attemptedAction
    }
  );
}

/**
 * Query audit logs (for admin users)
 * @param {Object} filters - Filter options
 * @param {string} filters.userId - Filter by user ID
 * @param {string} filters.action - Filter by action type
 * @param {string} filters.resource - Filter by resource type
 * @param {Date} filters.startDate - Start date
 * @param {Date} filters.endDate - End date
 * @param {number} filters.limit - Maximum number of results
 * @returns {Promise<Array>} Array of audit log entries
 */
async function queryAuditLogs(filters = {}) {
  try {
    let query = firebase.firestore().collection(AUDIT_COLLECTION);
    
    // Apply filters
    if (filters.userId) {
      query = query.where('userId', '==', filters.userId);
    }
    if (filters.action) {
      query = query.where('action', '==', filters.action);
    }
    if (filters.resource) {
      query = query.where('resource', '==', filters.resource);
    }
    if (filters.startDate) {
      query = query.where('timestamp', '>=', filters.startDate);
    }
    if (filters.endDate) {
      query = query.where('timestamp', '<=', filters.endDate);
    }
    
    // Order by timestamp (newest first)
    query = query.orderBy('timestamp', 'desc');
    
    // Limit results
    if (filters.limit) {
      query = query.limit(filters.limit);
    } else {
      query = query.limit(100); // Default limit
    }
    
    const snapshot = await query.get();
    const logs = [];
    
    snapshot.forEach(doc => {
      logs.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    return logs;
    
  } catch (error) {
    console.error('Error querying audit logs:', error);
    return [];
  }
}

// Export functions
window.AuditLogger = {
  log: logAuditEvent,
  logLogin: logLogin,
  logLogout: logLogout,
  logPatientOperation: logPatientOperation,
  logCareOperation: logCareOperation,
  logStatusChange: logStatusChange,
  logConsentOperation: logConsentOperation,
  logSecurityEvent: logSecurityEvent,
  logUnauthorizedAccess: logUnauthorizedAccess,
  query: queryAuditLogs,
  ACTIONS: AUDIT_ACTIONS
};

// Generate session ID on load
if (!localStorage.getItem('sessionId')) {
  localStorage.setItem('sessionId', 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9));
}

console.log('✅ Audit Logger initialized');

