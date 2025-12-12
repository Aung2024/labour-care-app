/**
 * Session Management Utility
 * Handles session timeout, activity tracking, and secure session management
 */

// Session configuration
const SESSION_CONFIG = {
  INACTIVITY_TIMEOUT: 30 * 60 * 1000, // 30 minutes in milliseconds
  WARNING_TIME: 5 * 60 * 1000, // Show warning 5 minutes before timeout
  CHECK_INTERVAL: 60 * 1000, // Check every minute
  MAX_SESSIONS: 3 // Maximum concurrent sessions per user
};

// Session state
let sessionState = {
  lastActivity: Date.now(),
  warningShown: false,
  warningTimer: null,
  logoutTimer: null,
  activityCheckInterval: null,
  isActive: true
};

/**
 * Initialize session management
 */
function initSessionManager() {
  // Check if user is authenticated
  firebase.auth().onAuthStateChanged((user) => {
    if (user) {
      startSessionTracking();
      setupActivityListeners();
    } else {
      stopSessionTracking();
    }
  });
}

/**
 * Start session tracking
 */
function startSessionTracking() {
  // Reset session state
  sessionState.lastActivity = Date.now();
  sessionState.warningShown = false;
  sessionState.isActive = true;
  
  // Clear any existing timers
  clearTimers();
  
  // Set up activity check interval
  sessionState.activityCheckInterval = setInterval(() => {
    checkSessionActivity();
  }, SESSION_CONFIG.CHECK_INTERVAL);
  
  // Store session start time
  localStorage.setItem('sessionStartTime', Date.now().toString());
  
  console.log('✅ Session tracking started');
}

/**
 * Stop session tracking
 */
function stopSessionTracking() {
  clearTimers();
  removeActivityListeners();
  sessionState.isActive = false;
  console.log('✅ Session tracking stopped');
}

/**
 * Setup activity listeners (mouse, keyboard, touch, scroll)
 */
function setupActivityListeners() {
  const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
  
  events.forEach(event => {
    document.addEventListener(event, updateLastActivity, { passive: true });
  });
  
  // Also track visibility changes (tab focus)
  document.addEventListener('visibilitychange', handleVisibilityChange);
}

/**
 * Remove activity listeners
 */
function removeActivityListeners() {
  const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
  
  events.forEach(event => {
    document.removeEventListener(event, updateLastActivity);
  });
  
  document.removeEventListener('visibilitychange', handleVisibilityChange);
}

/**
 * Update last activity timestamp
 */
function updateLastActivity() {
  if (sessionState.isActive) {
    sessionState.lastActivity = Date.now();
    
    // If warning was shown and user is active again, hide warning
    if (sessionState.warningShown) {
      hideSessionWarning();
      sessionState.warningShown = false;
    }
  }
}

/**
 * Handle visibility change (tab focus/blur)
 */
function handleVisibilityChange() {
  if (document.hidden) {
    // Tab is hidden, but don't count as inactivity
    // Just log for audit purposes
    console.log('Tab hidden at:', new Date().toISOString());
  } else {
    // Tab is visible again, update activity
    updateLastActivity();
  }
}

/**
 * Check session activity and handle timeout
 */
function checkSessionActivity() {
  if (!sessionState.isActive) return;
  
  const now = Date.now();
  const timeSinceActivity = now - sessionState.lastActivity;
  const timeUntilTimeout = SESSION_CONFIG.INACTIVITY_TIMEOUT - timeSinceActivity;
  
  // Show warning if approaching timeout
  if (timeUntilTimeout <= SESSION_CONFIG.WARNING_TIME && timeUntilTimeout > 0 && !sessionState.warningShown) {
    showSessionWarning(timeUntilTimeout);
    sessionState.warningShown = true;
  }
  
  // Logout if timeout exceeded
  if (timeSinceActivity >= SESSION_CONFIG.INACTIVITY_TIMEOUT) {
    handleSessionTimeout();
  }
}

/**
 * Show session warning
 */
function showSessionWarning(timeRemaining) {
  const minutes = Math.ceil(timeRemaining / 60000);
  
  // Create or update warning element
  let warningDiv = document.getElementById('sessionWarning');
  if (!warningDiv) {
    warningDiv = document.createElement('div');
    warningDiv.id = 'sessionWarning';
    warningDiv.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: linear-gradient(135deg, #f59e0b, #d97706);
      color: white;
      padding: 1rem 2rem;
      border-radius: 12px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.3);
      z-index: 10000;
      font-weight: 600;
      text-align: center;
      animation: slideDown 0.3s ease-out;
    `;
    document.body.appendChild(warningDiv);
    
    // Add animation
    if (!document.getElementById('sessionWarningStyle')) {
      const style = document.createElement('style');
      style.id = 'sessionWarningStyle';
      style.textContent = `
        @keyframes slideDown {
          from { transform: translateX(-50%) translateY(-100px); opacity: 0; }
          to { transform: translateX(-50%) translateY(0); opacity: 1; }
        }
      `;
      document.head.appendChild(style);
    }
  }
  
  // Update warning message
  const currentLang = localStorage.getItem('language') || 'mm';
  const message = currentLang === 'en' 
    ? `⚠️ Your session will expire in ${minutes} minute${minutes > 1 ? 's' : ''}. Click anywhere to stay logged in.`
    : `⚠️ သင့်အကောင့်သည် ${minutes} မိနစ်အတွင်း ပိတ်သွားမည်။ ဆက်လက်အသုံးပြုလိုပါက နေရာတစ်ခုခုကို နှိပ်ပါ။`;
  
  warningDiv.innerHTML = `
    <i class="fas fa-exclamation-triangle me-2"></i>
    ${message}
    <button onclick="extendSession()" style="margin-left: 1rem; padding: 0.5rem 1rem; background: white; color: #d97706; border: none; border-radius: 6px; font-weight: 600; cursor: pointer;">
      ${currentLang === 'en' ? 'Stay Logged In' : 'ဆက်လက်အသုံးပြုရန်'}
    </button>
  `;
}

/**
 * Hide session warning
 */
function hideSessionWarning() {
  const warningDiv = document.getElementById('sessionWarning');
  if (warningDiv) {
    warningDiv.style.animation = 'slideDown 0.3s ease-out reverse';
    setTimeout(() => {
      if (warningDiv.parentNode) {
        warningDiv.parentNode.removeChild(warningDiv);
      }
    }, 300);
  }
}

/**
 * Extend session (called when user clicks "Stay Logged In")
 */
function extendSession() {
  updateLastActivity();
  hideSessionWarning();
  
  // Show confirmation
  const currentLang = localStorage.getItem('language') || 'mm';
  const message = currentLang === 'en' 
    ? '✅ Session extended. You will be logged out after 30 minutes of inactivity.'
    : '✅ အကောင့်ကို ဆက်လက်ဖွင့်ထားပါသည်။ ၃၀ မိနစ် လှုပ်ရှားမှု မရှိပါက အလိုအလျောက် ပိတ်သွားမည်။';
  
  showToast(message, 'success');
}

/**
 * Handle session timeout
 */
async function handleSessionTimeout() {
  console.log('⏰ Session timeout - logging out user');
  
  // Stop tracking
  stopSessionTracking();
  
  // Log the timeout event
  if (window.AuditLogger) {
    await AuditLogger.log({
      action: 'session_timeout',
      resource: 'user_session',
      details: 'Session expired due to inactivity'
    });
  }
  
  // Show timeout message
  const currentLang = localStorage.getItem('language') || 'mm';
  const message = currentLang === 'en' 
    ? 'Your session has expired due to inactivity. Please log in again.'
    : 'သင့်အကောင့်သည် လှုပ်ရှားမှု မရှိသောကြောင့် ပိတ်သွားပါသည်။ ကျေးဇူးပြု၍ ထပ်မံဝင်ရောက်ပါ။';
  
  alert(message);
  
  // Logout and redirect
  if (typeof logout === 'function') {
    logout();
  } else {
    firebase.auth().signOut();
    localStorage.clear();
    window.location.href = 'login.html';
  }
}

/**
 * Clear all timers
 */
function clearTimers() {
  if (sessionState.warningTimer) {
    clearTimeout(sessionState.warningTimer);
    sessionState.warningTimer = null;
  }
  
  if (sessionState.logoutTimer) {
    clearTimeout(sessionState.logoutTimer);
    sessionState.logoutTimer = null;
  }
  
  if (sessionState.activityCheckInterval) {
    clearInterval(sessionState.activityCheckInterval);
    sessionState.activityCheckInterval = null;
  }
}

/**
 * Get session information
 */
function getSessionInfo() {
  const sessionStartTime = localStorage.getItem('sessionStartTime');
  const sessionDuration = sessionStartTime 
    ? Math.floor((Date.now() - parseInt(sessionStartTime)) / 1000 / 60) 
    : 0;
  
  const timeSinceActivity = Math.floor((Date.now() - sessionState.lastActivity) / 1000 / 60);
  const timeUntilTimeout = Math.ceil((SESSION_CONFIG.INACTIVITY_TIMEOUT - (Date.now() - sessionState.lastActivity)) / 1000 / 60);
  
  return {
    isActive: sessionState.isActive,
    sessionDuration: sessionDuration,
    timeSinceActivity: timeSinceActivity,
    timeUntilTimeout: timeUntilTimeout > 0 ? timeUntilTimeout : 0,
    lastActivity: new Date(sessionState.lastActivity).toISOString()
  };
}

/**
 * Manually refresh session (for "Remember Me" functionality)
 */
function refreshSession() {
  updateLastActivity();
  
  // Update session start time if "Remember Me" is enabled
  const rememberMe = localStorage.getItem('rememberMe') === 'true';
  if (rememberMe) {
    const expiryTime = Date.now() + (7 * 24 * 60 * 60 * 1000); // 7 days
    localStorage.setItem('sessionExpiry', expiryTime.toString());
  }
}

/**
 * Show toast notification
 */
function showToast(message, type = 'info') {
  // Create toast element if it doesn't exist
  let toast = document.getElementById('sessionToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'sessionToast';
    toast.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      padding: 1rem 1.5rem;
      border-radius: 8px;
      color: white;
      font-weight: 600;
      z-index: 10001;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      animation: slideIn 0.3s ease-out;
    `;
    document.body.appendChild(toast);
  }
  
  // Set color based on type
  const colors = {
    success: 'linear-gradient(135deg, #10b981, #059669)',
    error: 'linear-gradient(135deg, #dc2626, #b91c1c)',
    warning: 'linear-gradient(135deg, #f59e0b, #d97706)',
    info: 'linear-gradient(135deg, #3b82f6, #2563eb)'
  };
  
  toast.style.background = colors[type] || colors.info;
  toast.textContent = message;
  toast.style.display = 'block';
  
  // Auto-hide after 3 seconds
  setTimeout(() => {
    toast.style.animation = 'slideIn 0.3s ease-out reverse';
    setTimeout(() => {
      toast.style.display = 'none';
    }, 300);
  }, 3000);
}

// Export functions
window.SessionManager = {
  init: initSessionManager,
  start: startSessionTracking,
  stop: stopSessionTracking,
  extend: extendSession,
  refresh: refreshSession,
  getInfo: getSessionInfo,
  CONFIG: SESSION_CONFIG
};

// Auto-initialize when script loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSessionManager);
} else {
  initSessionManager();
}

