/**
 * User Data Cache
 * Caches user data to avoid redundant Firestore queries on page navigation
 * 
 * This significantly improves page load speed when navigating between pages
 */

const USER_DATA_CACHE = {
  data: null,
  timestamp: null,
  userId: null,
  TTL: 10 * 60 * 1000 // 10 minutes cache (user data doesn't change often)
};

/**
 * Get cached user data if available and valid
 */
function getCachedUserData(userId) {
  // Check if cache is for the same user
  if (USER_DATA_CACHE.userId !== userId) {
    return null;
  }
  
  // Check if cache is still valid
  if (!USER_DATA_CACHE.data || !USER_DATA_CACHE.timestamp) {
    return null;
  }
  
  const now = Date.now();
  const age = now - USER_DATA_CACHE.timestamp;
  
  if (age > USER_DATA_CACHE.TTL) {
    // Cache expired
    clearUserDataCache();
    return null;
  }
  
  console.log('✅ Using cached user data (age:', Math.round(age / 1000), 'seconds)');
  return USER_DATA_CACHE.data;
}

/**
 * Cache user data
 */
function cacheUserData(userId, userData) {
  USER_DATA_CACHE.data = userData;
  USER_DATA_CACHE.timestamp = Date.now();
  USER_DATA_CACHE.userId = userId;
  console.log('✅ User data cached');
}

/**
 * Clear user data cache
 */
function clearUserDataCache() {
  USER_DATA_CACHE.data = null;
  USER_DATA_CACHE.timestamp = null;
  USER_DATA_CACHE.userId = null;
  console.log('✅ User data cache cleared');
}

/**
 * Get user data with caching
 * This function should be used instead of direct Firestore queries
 */
async function getUserData(userId, forceRefresh = false) {
  // Return cached data if available and not forcing refresh
  if (!forceRefresh) {
    const cached = getCachedUserData(userId);
    if (cached) {
      return cached;
    }
  }
  
  // Fetch from Firestore
  // iOS/SAFARI COMPATIBLE: Use smartFirestoreQuery instead of direct .get()
  try {
    const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent || "");
    const userQuery = firebase.firestore()
      .collection('users')
      .doc(userId);
    
    // Use smartFirestoreQuery for iOS/Safari compatibility
    const userDoc = await smartFirestoreQuery(
      Promise.resolve(userQuery),
      { 
        preferCache: isIOS, 
        timeout: 8000, 
        retries: 2, 
        fallbackToCache: true 
      }
    );
    
    if (!userDoc.exists) {
      console.warn('⚠️ User document not found');
      return null;
    }
    
    const userData = userDoc.data();
    
    // Cache the data
    cacheUserData(userId, userData);
    
    return userData;
  } catch (error) {
    console.error('❌ Error fetching user data:', error);
    // Return cached data if available (even if expired) as fallback
    if (USER_DATA_CACHE.data && USER_DATA_CACHE.userId === userId) {
      console.log('⚠️ Using expired cache due to error');
      return USER_DATA_CACHE.data;
    }
    throw error;
  }
}

// Export functions
window.UserCache = {
  get: getUserData,
  getCached: getCachedUserData,
  cache: cacheUserData,
  clear: clearUserDataCache
};

// Clear cache on logout
if (typeof firebase !== 'undefined' && firebase.auth) {
  firebase.auth().onAuthStateChanged((user) => {
    if (!user) {
      clearUserDataCache();
    }
  });
}

console.log('✅ User Cache initialized');

