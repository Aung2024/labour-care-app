
var firebaseConfig = {
  apiKey: "AIzaSyC8-y2xnLINlVTWOOaU8-w82RBzSo2djAQ",
  authDomain: "labourcare-2481a.firebaseapp.com",
  projectId: "labourcare-2481a",
  storageBucket: "labourcare-2481a.appspot.com",
  messagingSenderId: "1033457212744",
  appId: "1:1033457212744:web:4d767eb4ef246b1090e77d"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Detect iOS
const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

// Enable offline persistence for better performance and offline support
// iOS Safari has known issues with IndexedDB, so we handle it more carefully
try {
  if (isIOS) {
    // On iOS, try persistence but don't fail if it doesn't work
    db.enablePersistence({
      synchronizeTabs: false // Disable tab sync on iOS to avoid conflicts
    }).catch((err) => {
      console.warn('iOS Persistence error (non-critical):', err.code || err.message);
      // Continue without persistence - app will still work
    });
  } else {
    // On other platforms, use full persistence
    db.enablePersistence({
      synchronizeTabs: true
    }).catch((err) => {
      if (err.code == 'failed-precondition') {
        console.warn('Persistence can only be enabled in one tab at a time.');
      } else if (err.code == 'unimplemented') {
        console.warn('Persistence is not supported in this browser.');
      } else {
        console.warn('Error enabling persistence:', err);
      }
    });
  }
} catch (error) {
  console.warn('Persistence initialization error:', error);
  // Continue without persistence - app will still work
}

// Smart query function: tries server first, falls back to cache on iOS or network errors
window.smartFirestoreQuery = async function(queryPromise, options = {}) {
  const { 
    preferCache = false, 
    timeout = 10000, 
    retries = 2,
    fallbackToCache = true 
  } = options;
  
  // If preferCache is true (for iOS), try cache first
  if (preferCache && isIOS) {
    try {
      // Try cache first on iOS
      const cacheResult = await Promise.race([
        queryPromise.then(q => q.get({ source: 'cache' })),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Cache timeout')), 3000))
      ]);
      if (cacheResult && !cacheResult.empty) {
        console.log('✅ Loaded from cache (iOS)');
        return cacheResult;
      }
    } catch (cacheError) {
      console.log('Cache miss, trying server...');
    }
  }
  
  // Try server with timeout and retries
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = await Promise.race([
        queryPromise.then(q => q.get({ source: 'server' })),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Server timeout')), timeout))
      ]);
      console.log('✅ Loaded from server');
      return result;
    } catch (error) {
      const isLastAttempt = attempt === retries;
      const isNetworkError = 
        error.message && (
          error.message.includes('timeout') ||
          error.message.includes('Failed to get') ||
          error.message.includes('UNAVAILABLE') ||
          error.message.includes('network') ||
          error.code === 'unavailable' ||
          error.code === 'deadline-exceeded'
        );
      
      if (isLastAttempt) {
        // Last attempt failed - try cache if enabled
        if (fallbackToCache && isNetworkError) {
          try {
            console.log('⚠️ Server failed, trying cache fallback...');
            const cacheResult = await queryPromise.then(q => q.get({ source: 'cache' }));
            if (cacheResult && !cacheResult.empty) {
              console.log('✅ Loaded from cache (fallback)');
              return cacheResult;
            }
          } catch (cacheError) {
            console.warn('Cache fallback also failed:', cacheError);
          }
        }
        // If all fails, try default (cache or server)
        try {
          console.log('⚠️ Trying default source (cache or server)...');
          const defaultResult = await queryPromise.then(q => q.get());
          console.log('✅ Loaded from default source');
          return defaultResult;
        } catch (defaultError) {
          throw error; // Throw original error
        }
      }
      
      // Wait before retry (exponential backoff)
      if (!isLastAttempt) {
        const delay = 1000 * Math.pow(2, attempt);
        console.log(`⚠️ Retry ${attempt + 1}/${retries} in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
};
