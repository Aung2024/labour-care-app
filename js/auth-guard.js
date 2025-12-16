/**
 * Authentication Guard
 * Enforces authentication on all pages - redirects to login if not authenticated
 * This must be included on every page that requires authentication
 */

// Pages that don't require authentication (public pages)
const PUBLIC_PAGES = [
  'login.html',
  'registration.html',
  'privacy-policy.html'
];

// Pages that require authentication but allow unauthenticated access for specific flows
// (e.g., provider-consent.html can be accessed during registration flow)
const CONDITIONAL_PAGES = [
  'provider-consent.html',
  'patient-consent.html'
];

/**
 * Check if current page is a public page
 */
function isPublicPage() {
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  return PUBLIC_PAGES.includes(currentPage);
}

/**
 * Check if current page is a conditional page
 */
function isConditionalPage() {
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  return CONDITIONAL_PAGES.includes(currentPage);
}

/**
 * Initialize authentication guard
 * This function should be called on every page load
 */
function initAuthGuard() {
  // Skip auth check for public pages
  if (isPublicPage()) {
    console.log('✅ Public page - skipping auth check');
    return;
  }

  // Wait for Firebase to initialize
  if (typeof firebase === 'undefined' || !firebase.auth) {
    console.error('❌ Firebase Auth not loaded - cannot enforce authentication');
    // Retry after a short delay
    setTimeout(initAuthGuard, 500);
    return;
  }

  // Check authentication status
  firebase.auth().onAuthStateChanged((user) => {
    if (!user) {
      // User is not authenticated
      console.warn('⚠️ No authenticated user - redirecting to login');
      
      // For conditional pages, check if we're in a valid flow
      if (isConditionalPage()) {
        // Check if we have session data indicating a valid flow
        const hasSessionData = localStorage.getItem('uid') || sessionStorage.getItem('patientData');
        if (!hasSessionData) {
          console.warn('⚠️ No valid session data for conditional page - redirecting to login');
          redirectToLogin();
          return;
        }
        // Allow access to conditional pages if we have session data
        console.log('✅ Conditional page with valid session data - allowing access');
        return;
      }

      // For all other pages, redirect to login
      redirectToLogin();
    } else {
      // User is authenticated
      console.log('✅ User authenticated:', user.uid);
      
      // Verify user exists in Firestore (additional security check)
      verifyUserInFirestore(user.uid).then((isValid) => {
        if (!isValid) {
          console.warn('⚠️ User not found in Firestore - redirecting to login');
          firebase.auth().signOut();
          redirectToLogin();
        } else {
          console.log('✅ User verified in Firestore');
        }
      }).catch((error) => {
        console.error('❌ Error verifying user in Firestore:', error);
        // Don't block access if verification fails (could be network issue)
        // But log it for security monitoring
      });
    }
  });
}

/**
 * Verify user exists in Firestore
 */
async function verifyUserInFirestore(userId) {
  try {
    const userDoc = await firebase.firestore()
      .collection('users')
      .doc(userId)
      .get();
    
    if (!userDoc.exists) {
      console.warn('⚠️ User document does not exist in Firestore');
      return false;
    }

    const userData = userDoc.data();
    
    // Check if user is approved (if approval system is enabled)
    const isApproved = userData.approved === true || userData.status === 'approved' || userData.approved === undefined;
    
    if (!isApproved) {
      console.warn('⚠️ User account is not approved');
      return false;
    }

    return true;
  } catch (error) {
    console.error('❌ Error verifying user in Firestore:', error);
    // Return true to avoid blocking access on network errors
    // But log the error for monitoring
    return true;
  }
}

/**
 * Redirect to login page
 */
function redirectToLogin() {
  // Clear any session data
  localStorage.removeItem('uid');
  localStorage.removeItem('role');
  localStorage.removeItem('userEmail');
  localStorage.removeItem('userTownship');
  localStorage.removeItem('userRegion');
  localStorage.removeItem('rememberMe');
  localStorage.removeItem('sessionExpiry');
  
  // Clear session storage
  sessionStorage.clear();
  
  // Get current page to redirect back after login
  const currentPage = window.location.pathname + window.location.search;
  
  // Redirect to login with return URL
  const loginUrl = `login.html?redirect=${encodeURIComponent(currentPage)}`;
  
  // Use replace to prevent back button from going to protected page
  window.location.replace(loginUrl);
}

/**
 * Check if user is authenticated (synchronous check)
 * Returns true if user is authenticated, false otherwise
 */
function isAuthenticated() {
  const user = firebase.auth().currentUser;
  return user !== null;
}

/**
 * Require authentication - throws error if not authenticated
 * Use this in functions that require authentication
 */
function requireAuth() {
  if (!isAuthenticated()) {
    throw new Error('Authentication required');
  }
}

// Export functions
window.AuthGuard = {
  init: initAuthGuard,
  isAuthenticated: isAuthenticated,
  requireAuth: requireAuth,
  isPublicPage: isPublicPage,
  redirectToLogin: redirectToLogin
};

// Auto-initialize when script loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAuthGuard);
} else {
  // DOM already loaded
  initAuthGuard();
}

console.log('✅ Authentication Guard initialized');

