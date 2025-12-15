/**
 * Password Policy & Account Security Utility
 * Handles password validation, account lockout, and security policies
 */

// Password policy configuration
const PASSWORD_POLICY = {
  minLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: true,
  maxLength: 128,
  preventCommonPasswords: true,
  preventReuse: 5 // Prevent reuse of last 5 passwords
};

// Account lockout configuration
const LOCKOUT_CONFIG = {
  maxAttempts: 5,
  lockoutDuration: 15 * 60 * 1000, // 15 minutes in milliseconds
  exponentialBackoff: true // Increase lockout duration after each lockout
};

// Common passwords to prevent
const COMMON_PASSWORDS = [
  'password', '12345678', '123456789', 'qwerty', 'abc123',
  'password1', '123456', 'welcome', 'monkey', '1234567890',
  'letmein', 'trustno1', 'dragon', 'baseball', 'iloveyou',
  'master', 'sunshine', 'ashley', 'bailey', 'passw0rd',
  'shadow', '123123', '654321', 'superman', 'qazwsx',
  'michael', 'football', 'jesus', 'ninja', 'mustang'
];

/**
 * Validate password against policy
 * @param {string} password - Password to validate
 * @returns {Object} Validation result with isValid and errors
 */
function validatePassword(password) {
  const errors = [];
  
  // Check minimum length
  if (password.length < PASSWORD_POLICY.minLength) {
    errors.push(`Password must be at least ${PASSWORD_POLICY.minLength} characters long`);
  }
  
  // Check maximum length
  if (password.length > PASSWORD_POLICY.maxLength) {
    errors.push(`Password must be no more than ${PASSWORD_POLICY.maxLength} characters long`);
  }
  
  // Check uppercase
  if (PASSWORD_POLICY.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  
  // Check lowercase
  if (PASSWORD_POLICY.requireLowercase && !/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  
  // Check numbers
  if (PASSWORD_POLICY.requireNumbers && !/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }
  
  // Check special characters
  if (PASSWORD_POLICY.requireSpecialChars && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push('Password must contain at least one special character (!@#$%^&*...)');
  }
  
  // Check common passwords
  if (PASSWORD_POLICY.preventCommonPasswords) {
    const lowerPassword = password.toLowerCase();
    if (COMMON_PASSWORDS.includes(lowerPassword)) {
      errors.push('Password is too common. Please choose a more secure password');
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors: errors,
    strength: calculatePasswordStrength(password)
  };
}

/**
 * Calculate password strength
 * @param {string} password - Password to evaluate
 * @returns {string} Strength level: 'weak', 'medium', 'strong', 'very-strong'
 */
function calculatePasswordStrength(password) {
  let strength = 0;
  
  // Length bonus
  if (password.length >= 8) strength += 1;
  if (password.length >= 12) strength += 1;
  if (password.length >= 16) strength += 1;
  
  // Character variety bonus
  if (/[a-z]/.test(password)) strength += 1;
  if (/[A-Z]/.test(password)) strength += 1;
  if (/[0-9]/.test(password)) strength += 1;
  if (/[^a-zA-Z0-9]/.test(password)) strength += 1;
  
  // Penalty for common patterns
  if (/(.)\1{2,}/.test(password)) strength -= 1; // Repeated characters
  if (/123|abc|qwe/i.test(password)) strength -= 1; // Sequential patterns
  
  if (strength <= 2) return 'weak';
  if (strength <= 4) return 'medium';
  if (strength <= 6) return 'strong';
  return 'very-strong';
}

/**
 * Get password strength indicator HTML
 * @param {string} password - Password to evaluate
 * @returns {string} HTML for strength indicator
 */
function getPasswordStrengthIndicator(password) {
  if (!password || password.length === 0) return '';
  
  const strength = calculatePasswordStrength(password);
  const strengthLabels = {
    'weak': { text: 'Weak', color: '#dc2626', width: '25%' },
    'medium': { text: 'Medium', color: '#f59e0b', width: '50%' },
    'strong': { text: 'Strong', color: '#10b981', width: '75%' },
    'very-strong': { text: 'Very Strong', color: '#059669', width: '100%' }
  };
  
  const strengthInfo = strengthLabels[strength] || strengthLabels['weak'];
  
  return `
    <div class="password-strength-indicator" style="margin-top: 0.5rem;">
      <div style="display: flex; align-items: center; gap: 0.5rem;">
        <div style="flex: 1; height: 4px; background: #e5e7eb; border-radius: 2px; overflow: hidden;">
          <div style="height: 100%; width: ${strengthInfo.width}; background: ${strengthInfo.color}; transition: all 0.3s;"></div>
        </div>
        <span style="font-size: 0.875rem; font-weight: 600; color: ${strengthInfo.color};">
          ${strengthInfo.text}
        </span>
      </div>
    </div>
  `;
}

/**
 * Check if account is locked
 * @param {string} userId - User ID or email
 * @returns {Promise<Object>} Lock status with isLocked and unlockTime
 */
async function checkAccountLockout(userId) {
  try {
    const lockoutDoc = await firebase.firestore()
      .collection('account_lockouts')
      .doc(userId)
      .get();
    
    if (!lockoutDoc.exists) {
      return { isLocked: false, unlockTime: null, attempts: 0 };
    }
    
    const lockoutData = lockoutDoc.data();
    const now = Date.now();
    const lockoutUntil = lockoutData.lockoutUntil?.toMillis() || 0;
    
    // Check if lockout has expired
    if (now > lockoutUntil) {
      // Lockout expired, remove it
      await firebase.firestore()
        .collection('account_lockouts')
        .doc(userId)
        .delete();
      
      return { isLocked: false, unlockTime: null, attempts: 0 };
    }
    
    return {
      isLocked: true,
      unlockTime: new Date(lockoutUntil),
      attempts: lockoutData.attempts || 0,
      remainingTime: Math.ceil((lockoutUntil - now) / 1000 / 60) // minutes
    };
    
  } catch (error) {
    console.error('Error checking account lockout:', error);
    return { isLocked: false, unlockTime: null, attempts: 0 };
  }
}

/**
 * Record failed login attempt
 * @param {string} userId - User ID or email
 * @returns {Promise<Object>} Lock status after recording attempt
 */
async function recordFailedLoginAttempt(userId) {
  try {
    console.log('🔒 recordFailedLoginAttempt called with userId:', userId);
    const lockoutRef = firebase.firestore()
      .collection('account_lockouts')
      .doc(userId);
    
    console.log('🔒 Checking existing lockout document...');
    const lockoutDoc = await lockoutRef.get();
    console.log('🔒 Lockout document exists:', lockoutDoc.exists);
    const now = Date.now();
    
    let attempts = 1;
    let lockoutUntil = null;
    let isLocked = false;
    
    if (lockoutDoc.exists) {
      const data = lockoutDoc.data();
      attempts = (data.attempts || 0) + 1;
      
      // Check if already locked
      const existingLockoutUntil = data.lockoutUntil?.toMillis() || 0;
      if (now < existingLockoutUntil) {
        // Still locked
        return {
          isLocked: true,
          unlockTime: new Date(existingLockoutUntil),
          attempts: attempts,
          remainingTime: Math.ceil((existingLockoutUntil - now) / 1000 / 60)
        };
      }
    }
    
    // Check if should lock account
    if (attempts >= LOCKOUT_CONFIG.maxAttempts) {
      // Calculate lockout duration (exponential backoff)
      const lockoutCount = lockoutDoc.exists ? (lockoutDoc.data().lockoutCount || 0) + 1 : 1;
      const lockoutDuration = LOCKOUT_CONFIG.exponentialBackoff
        ? LOCKOUT_CONFIG.lockoutDuration * Math.pow(2, lockoutCount - 1)
        : LOCKOUT_CONFIG.lockoutDuration;
      
      lockoutUntil = now + lockoutDuration;
      isLocked = true;
      
      // Log account lockout
      if (window.AuditLogger) {
        await AuditLogger.logSecurityEvent(
          'account_locked',
          `Account locked after ${attempts} failed login attempts`,
          { userId: userId, attempts: attempts, lockoutDuration: lockoutDuration }
        );
      }
    }
    
    // Update lockout record
    console.log('🔒 Saving lockout record to Firestore:', {
      userId: userId,
      attempts: attempts,
      isLocked: isLocked,
      lockoutUntil: lockoutUntil
    });
    
    try {
      await lockoutRef.set({
        attempts: attempts,
        lockoutUntil: lockoutUntil ? firebase.firestore.Timestamp.fromMillis(lockoutUntil) : null,
        lockoutCount: lockoutDoc.exists ? (lockoutDoc.data().lockoutCount || 0) + 1 : 1,
        lastAttempt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        email: userId // Store email for easier querying
      }, { merge: true });
      
      console.log('✅ Lockout record saved successfully');
    } catch (writeError) {
      console.error('❌ Error writing lockout record:', writeError);
      console.error('❌ Error code:', writeError.code);
      console.error('❌ Error message:', writeError.message);
      throw writeError; // Re-throw to be caught by outer catch
    }
    
    return {
      isLocked: isLocked,
      unlockTime: lockoutUntil ? new Date(lockoutUntil) : null,
      attempts: attempts,
      remainingTime: lockoutUntil ? Math.ceil((lockoutUntil - now) / 1000 / 60) : null
    };
    
  } catch (error) {
    console.error('❌ Error recording failed login attempt:', error);
    console.error('❌ Error details:', {
      code: error.code,
      message: error.message,
      stack: error.stack
    });
    return { isLocked: false, unlockTime: null, attempts: 0 };
  }
}

/**
 * Clear failed login attempts (on successful login)
 * @param {string} userId - User ID or email
 */
async function clearFailedLoginAttempts(userId) {
  try {
    await firebase.firestore()
      .collection('account_lockouts')
      .doc(userId)
      .delete();
    
    console.log('✅ Cleared failed login attempts for:', userId);
  } catch (error) {
    console.error('Error clearing failed login attempts:', error);
  }
}

/**
 * Check if password was recently used
 * @param {string} userId - User ID
 * @param {string} newPassword - New password to check
 * @returns {Promise<boolean>} True if password was recently used
 */
async function checkPasswordHistory(userId, newPassword) {
  try {
    // Get password history
    const historyDoc = await firebase.firestore()
      .collection('password_history')
      .doc(userId)
      .get();
    
    if (!historyDoc.exists) {
      return false; // No history, password is new
    }
    
    const history = historyDoc.data().passwords || [];
    
    // Check against last N passwords
    for (let i = 0; i < Math.min(history.length, PASSWORD_POLICY.preventReuse); i++) {
      // In a real implementation, you would hash and compare
      // For now, we'll do a simple comparison (NOT SECURE - should use hashing)
      // TODO: Implement proper password hashing comparison
      if (history[i] === newPassword) {
        return true; // Password was recently used
      }
    }
    
    return false; // Password is new
    
  } catch (error) {
    console.error('Error checking password history:', error);
    return false; // Allow password change if check fails
  }
}

/**
 * Save password to history
 * @param {string} userId - User ID
 * @param {string} password - Password to save (should be hashed in production)
 */
async function savePasswordToHistory(userId, password) {
  try {
    // In production, password should be hashed before storing
    // For now, we'll store a hash (this is a simplified version)
    // TODO: Implement proper password hashing
    
    const historyRef = firebase.firestore()
      .collection('password_history')
      .doc(userId);
    
    const historyDoc = await historyRef.get();
    let passwords = [];
    
    if (historyDoc.exists) {
      passwords = historyDoc.data().passwords || [];
    }
    
    // Add new password to front of array
    passwords.unshift(password);
    
    // Keep only last N passwords
    passwords = passwords.slice(0, PASSWORD_POLICY.preventReuse);
    
    // Save to Firestore
    await historyRef.set({
      passwords: passwords,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    
    console.log('✅ Password saved to history');
    
  } catch (error) {
    console.error('Error saving password to history:', error);
  }
}

/**
 * Get password policy description
 * @param {string} lang - Language ('en' or 'mm')
 * @returns {string} Policy description
 */
function getPasswordPolicyDescription(lang = 'en') {
  if (lang === 'mm') {
    return `
      <small class="text-muted">
        <strong>စကားဝှက် လိုအပ်ချက်များ:</strong><br>
        • အနည်းဆုံး ${PASSWORD_POLICY.minLength} လုံး ရှိရမည်<br>
        • အင်္ဂလိပ် အက္ခရာ ကြီး (A-Z) အနည်းဆုံး ၁ လုံး<br>
        • အင်္ဂလိပ် အက္ခရာ သေး (a-z) အနည်းဆုံး ၁ လုံး<br>
        • ဂဏန်း (0-9) အနည်းဆုံး ၁ လုံး<br>
        • အထူး သင်္ကေတ (!@#$%...) အနည်းဆုံး ၁ လုံး
      </small>
    `;
  }
  
  return `
    <small class="text-muted">
      <strong>Password Requirements:</strong><br>
      • Minimum ${PASSWORD_POLICY.minLength} characters<br>
      • At least one uppercase letter (A-Z)<br>
      • At least one lowercase letter (a-z)<br>
      • At least one number (0-9)<br>
      • At least one special character (!@#$%...)
    </small>
  `;
}

// Export functions
window.PasswordPolicy = {
  validate: validatePassword,
  getStrength: calculatePasswordStrength,
  getStrengthIndicator: getPasswordStrengthIndicator,
  checkLockout: checkAccountLockout,
  recordFailedAttempt: recordFailedLoginAttempt,
  clearFailedAttempts: clearFailedLoginAttempts,
  checkHistory: checkPasswordHistory,
  saveToHistory: savePasswordToHistory,
  getDescription: getPasswordPolicyDescription,
  POLICY: PASSWORD_POLICY,
  LOCKOUT: LOCKOUT_CONFIG
};

console.log('✅ Password Policy Manager initialized');

