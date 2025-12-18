/**
 * Role-Based Access Control (RBAC) Manager
 * Manages permissions and role-based UI visibility
 * 
 * Roles:
 * - Super Admin: Full access to all features
 * - TMO: Township Medical Officer - can view all patients in their township
 * - Midwife: Can only view/manage their own patients
 */

// Permission matrix
const ROLE_PERMISSIONS = {
  'Super Admin': {
    // Patient Management
    viewAllPatients: true,
    createPatient: true,
    editAnyPatient: true,
    deleteAnyPatient: true,
    viewAnyPatientDetails: true,
    
    // User Management
    viewAllUsers: true,
    approveUsers: true,
    rejectUsers: true,
    editUserRoles: true,
    deleteUsers: true,
    
    // Reports
    viewAllReports: true,
    viewTownshipReports: true,
    exportData: true,
    
    // Settings
    viewSettings: true,
    editSettings: true,
    viewAuditLogs: true,
    
    // Care Entry
    createAnyCareRecord: true,
    editAnyCareRecord: true,
    deleteAnyCareRecord: true,
    
    // Transfer
    transferAnyPatient: true,
    
    // Admin Features
    accessAdminPanel: true,
    manageFacilities: true,
    viewSystemStats: true
  },
  
  'TMO': {
    // Patient Management
    viewAllPatients: false, // Only township patients
    viewTownshipPatients: true,
    createPatient: true,
    editAnyPatient: false, // Only township patients
    editTownshipPatients: true,
    deleteAnyPatient: false,
    viewAnyPatientDetails: false, // Only township patients
    viewTownshipPatientDetails: true,
    
    // User Management
    viewAllUsers: false,
    viewTownshipUsers: true,
    approveUsers: false,
    rejectUsers: false,
    editUserRoles: false,
    deleteUsers: false,
    
    // Reports
    viewAllReports: false,
    viewTownshipReports: true,
    exportData: true,
    
    // Settings
    viewSettings: true,
    editSettings: true, // Own settings only
    viewAuditLogs: false,
    
    // Care Entry
    createAnyCareRecord: true,
    editAnyCareRecord: false, // Only own records
    deleteAnyCareRecord: false,
    
    // Transfer
    transferAnyPatient: true, // Township patients
    
    // Admin Features
    accessAdminPanel: false,
    manageFacilities: false,
    viewSystemStats: false
  },
  
  'Midwife': {
    // Patient Management
    viewAllPatients: false,
    viewOwnPatients: true,
    createPatient: true,
    editAnyPatient: false,
    editOwnPatients: true,
    deleteAnyPatient: false,
    viewAnyPatientDetails: false,
    viewOwnPatientDetails: true,
    
    // User Management
    viewAllUsers: false,
    viewTownshipUsers: false,
    approveUsers: false,
    rejectUsers: false,
    editUserRoles: false,
    deleteUsers: false,
    
    // Reports
    viewAllReports: false,
    viewTownshipReports: false,
    viewOwnReports: true,
    exportData: false,
    
    // Settings
    viewSettings: true,
    editSettings: true, // Own settings only
    viewAuditLogs: false,
    
    // Care Entry
    createAnyCareRecord: false,
    createOwnCareRecord: true,
    editAnyCareRecord: false,
    editOwnCareRecord: true,
    deleteAnyCareRecord: false,
    
    // Transfer
    transferAnyPatient: false,
    transferOwnPatients: true,
    
    // Admin Features
    accessAdminPanel: false,
    manageFacilities: false,
    viewSystemStats: false
  }
};

// Current user role (set on page load)
let currentUserRole = null;
let currentUserId = null;
let currentUserTownship = null;

/**
 * Initialize RBAC manager
 */
async function initRBAC() {
  const user = firebase.auth().currentUser;
  if (!user) {
    console.warn('⚠️ No authenticated user for RBAC');
    return;
  }
  
  currentUserId = user.uid;
  
  // Get user data (use cache if available)
  try {
    let userData;
    if (window.UserCache) {
      userData = await window.UserCache.get(user.uid);
    } else {
      const userDoc = await firebase.firestore()
        .collection('users')
        .doc(user.uid)
        .get();
      userData = userDoc.exists ? userDoc.data() : null;
    }
    
    if (userData) {
      currentUserRole = userData.role || 'Midwife';
      currentUserTownship = userData.township || null;
      console.log('✅ RBAC initialized - Role:', currentUserRole, 'Township:', currentUserTownship);
    } else {
      console.warn('⚠️ User data not found, defaulting to Midwife');
      currentUserRole = 'Midwife';
    }
  } catch (error) {
    console.error('❌ Error initializing RBAC:', error);
    currentUserRole = 'Midwife'; // Default to most restrictive
  }
}

/**
 * Check if user has a specific permission
 */
function hasPermission(permission) {
  if (!currentUserRole) {
    console.warn('⚠️ RBAC not initialized, denying permission:', permission);
    return false;
  }
  
  const permissions = ROLE_PERMISSIONS[currentUserRole];
  if (!permissions) {
    console.warn('⚠️ Unknown role:', currentUserRole);
    return false;
  }
  
  return permissions[permission] === true;
}

/**
 * Check if user can access a resource
 */
function canAccessResource(resourceType, resourceId, resourceData = null) {
  if (!currentUserRole) {
    return false;
  }
  
  // Super Admin can access everything
  if (currentUserRole === 'Super Admin') {
    return true;
  }
  
  // For patient resources
  if (resourceType === 'patient') {
    if (currentUserRole === 'TMO') {
      // TMO can access patients in their township
      if (resourceData && resourceData.township === currentUserTownship) {
        return true;
      }
      // If no resource data, check by patient ID (would need to fetch)
      return false; // Conservative: deny if we can't verify
    }
    
    if (currentUserRole === 'Midwife') {
      // Midwife can only access their own patients
      if (resourceData) {
        return resourceData.created_by === currentUserId || 
               resourceData.createdBy === currentUserId;
      }
      return false; // Conservative: deny if we can't verify
    }
  }
  
  // For care records
  if (resourceType === 'careRecord') {
    if (currentUserRole === 'TMO') {
      // TMO can access records for township patients
      return true; // Would need patient data to verify township
    }
    
    if (currentUserRole === 'Midwife') {
      // Midwife can only access their own records
      if (resourceData) {
        return resourceData.created_by === currentUserId ||
               resourceData.createdBy === currentUserId;
      }
      return false;
    }
  }
  
  return false;
}

/**
 * Get current user role
 */
function getCurrentRole() {
  return currentUserRole;
}

/**
 * Get current user township
 */
function getCurrentTownship() {
  return currentUserTownship;
}

/**
 * Check if user is Super Admin
 */
function isSuperAdmin() {
  return currentUserRole === 'Super Admin';
}

/**
 * Check if user is TMO
 */
function isTMO() {
  return currentUserRole === 'TMO';
}

/**
 * Check if user is Midwife
 */
function isMidwife() {
  return currentUserRole === 'Midwife' || currentUserRole === 'midwife';
}

/**
 * Show/hide UI elements based on permissions
 */
function applyRBACToUI() {
  // Hide elements with data-rbac attribute
  document.querySelectorAll('[data-rbac]').forEach(element => {
    const requiredPermission = element.getAttribute('data-rbac');
    if (!hasPermission(requiredPermission)) {
      element.style.display = 'none';
    } else {
      element.style.display = '';
    }
  });
  
  // Hide elements with data-role attribute
  document.querySelectorAll('[data-role]').forEach(element => {
    const requiredRoles = element.getAttribute('data-role').split(',').map(r => r.trim());
    if (!requiredRoles.includes(currentUserRole)) {
      element.style.display = 'none';
    } else {
      element.style.display = '';
    }
  });
  
  // Update role display in header
  const roleDisplayElements = document.querySelectorAll('[data-role-display]');
  roleDisplayElements.forEach(element => {
    if (currentUserRole) {
      element.textContent = currentUserRole;
      element.style.display = '';
    } else {
      element.style.display = 'none';
    }
  });
}

/**
 * Require permission - throws error if permission not granted
 */
function requirePermission(permission) {
  if (!hasPermission(permission)) {
    throw new Error(`Permission denied: ${permission}. Required role: ${currentUserRole}`);
  }
}

// Export functions
window.RBAC = {
  init: initRBAC,
  hasPermission: hasPermission,
  canAccessResource: canAccessResource,
  getCurrentRole: getCurrentRole,
  getCurrentTownship: getCurrentTownship,
  isSuperAdmin: isSuperAdmin,
  isTMO: isTMO,
  isMidwife: isMidwife,
  applyRBACToUI: applyRBACToUI,
  requirePermission: requirePermission
};

// Auto-initialize when user is authenticated
if (typeof firebase !== 'undefined' && firebase.auth) {
  firebase.auth().onAuthStateChanged((user) => {
    if (user) {
      initRBAC().then(() => {
        // Apply RBAC to UI after initialization
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', applyRBACToUI);
        } else {
          applyRBACToUI();
        }
      });
    } else {
      currentUserRole = null;
      currentUserId = null;
      currentUserTownship = null;
    }
  });
}

console.log('✅ RBAC Manager initialized');

