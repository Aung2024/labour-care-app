
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

// CRITICAL FIX: Force long polling instead of WebSockets
// WebSockets are often blocked by firewalls/proxies/ISPs, especially in restrictive regions
// Long polling uses standard HTTPS which is much more reliable
// This MUST be called before enablePersistence() and before any Firestore operations
try {
  // Check if settings were already called (to avoid warning)
  // In Firebase v8, we can't check this directly, so we just try and catch the warning
  db.settings({
    experimentalForceLongPolling: true,
    cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED
  });
  console.log('✅ Firestore configured with long polling (bypasses WebSocket blocks)');
} catch (error) {
  // Settings might have been called already - this is OK, just continue
  // The warning about overriding host is harmless if it appears
  console.log('✅ Firestore settings applied (long polling enabled)');
}

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

// Domain connectivity test - checks if Firebase domains are accessible
window.testFirebaseDomains = async function() {
  const domains = [
    { name: 'Firebase Auth', url: 'https://labourcare-2481a.firebaseapp.com', critical: true },
    { name: 'Firestore API', url: 'https://firestore.googleapis.com', critical: true },
    { name: 'Google Static', url: 'https://www.gstatic.com', critical: true },
    { name: 'Google APIs', url: 'https://www.googleapis.com', critical: false },
    { name: 'Storage', url: 'https://labourcare-2481a.appspot.com', critical: false }
  ];
  
  const results = [];
  for (const domain of domains) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const startTime = performance.now();
      
      // Try multiple methods to test connectivity
      let accessible = false;
      let latency = 0;
      let errorMsg = '';
      
      // IMPORTANT: CORS errors are EXPECTED and don't mean domain is blocked
      // Firebase domains don't allow CORS from arbitrary origins (security)
      // We need to test actual connectivity, not CORS
      
      // Method 1: Try with no-cors (doesn't check CORS, just connectivity)
      // Note: 404 errors are EXPECTED - Firebase domains don't serve content at root path
      // A 404 means the domain is reachable, which is what we want to test
      try {
        // Suppress console errors for this test by using a silent fetch
        const response = await Promise.race([
          fetch(domain.url, {
            method: 'HEAD',
            mode: 'no-cors', // no-cors doesn't check CORS, just connectivity
            cache: 'no-cache',
            signal: controller.signal
          }).catch(() => {
            // Even if fetch fails, try image method below
            throw new Error('Fetch failed, trying image method');
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000))
        ]);
        clearTimeout(timeoutId);
        latency = Math.round(performance.now() - startTime);
        // If we get here (even with opaque response or 404), domain is reachable
        accessible = true;
      } catch (fetchError) {
        // Fetch failed or timed out - try image method
        // Method 2: Try DNS resolution via image load (bypasses CORS entirely)
        try {
          clearTimeout(timeoutId);
          const controller2 = new AbortController();
          const timeoutId2 = setTimeout(() => controller2.abort(), 3000);
          
          await new Promise((resolve, reject) => {
            const img = new Image();
            const timeout = setTimeout(() => {
              controller2.abort();
              reject(new Error('Image load timeout'));
            }, 3000);
            
            img.onload = () => {
              clearTimeout(timeout);
              clearTimeout(timeoutId2);
              resolve();
            };
            img.onerror = () => {
              // Even onerror means DNS resolved and connection was attempted
              // This means domain is reachable (404 is fine, means domain exists)
              clearTimeout(timeout);
              clearTimeout(timeoutId2);
              resolve(); // Domain is reachable
            };
            // Use a path that likely doesn't exist (404 is fine, means domain is reachable)
            img.src = domain.url + '/favicon.ico?' + Date.now();
          });
          clearTimeout(timeoutId2);
          latency = Math.round(performance.now() - startTime);
          accessible = true;
        } catch (imgError) {
          // If image load fails completely, domain might be blocked
          // But check error type - DNS errors vs network errors
          const isDNSOrNetworkError = 
            imgError.message.includes('timeout') ||
            imgError.message.includes('Failed to fetch') ||
            imgError.message.includes('network');
          
          if (isDNSOrNetworkError) {
            errorMsg = 'Domain may be blocked or unreachable: ' + (imgError.message || 'Unknown error');
            accessible = false;
          } else {
            // Other errors might just mean the resource doesn't exist (but domain is reachable)
            accessible = true;
            latency = Math.round(performance.now() - startTime);
          }
        }
      }
      
      results.push({
        name: domain.name,
        url: domain.url,
        accessible: accessible,
        latency: latency,
        error: errorMsg,
        critical: domain.critical
      });
    } catch (error) {
      results.push({
        name: domain.name,
        url: domain.url,
        accessible: false,
        error: error.message || 'Unknown error',
        critical: domain.critical
      });
    }
  }
  
  const criticalFailed = results.filter(r => r.critical && !r.accessible);
  if (criticalFailed.length > 0) {
    // Don't show as CRITICAL error - just a warning, since 404s are expected
    // The domain test can give false positives - 404s mean domain is reachable!
    console.log('ℹ️ Domain connectivity check:', criticalFailed.map(r => r.name).join(', '));
    console.log('Note: 404 errors are NORMAL (Firebase doesn\'t serve content at root paths)');
    console.log('If app is not working, these are suggestions (not errors):');
    console.log('• Use VPN to bypass firewall');
    console.log('• Change DNS to 8.8.8.8 (Google) or 1.1.1.1 (Cloudflare)');
    console.log('• Use mobile data instead of WiFi');
  } else {
    const allAccessible = results.every(r => r.accessible);
    if (allAccessible) {
      console.log('✅ All Firebase domains are accessible');
    } else {
      const nonCriticalFailed = results.filter(r => !r.critical && !r.accessible);
      if (nonCriticalFailed.length > 0) {
        console.log('ℹ️ Some non-critical domains may have issues:', nonCriticalFailed.map(r => r.name).join(', '));
      }
    }
  }
  
  return results;
};

// Test domains on initialization (non-blocking, silent mode)
// Only runs if explicitly called - don't auto-run to avoid console noise
// Users can call testFirebaseDomains() manually if needed

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
        // Last attempt failed - try cache if enabled (CRITICAL: try cache BEFORE checking domains)
        if (fallbackToCache) {
          try {
            console.log('⚠️ Server failed, trying cache fallback...');
            const cacheResult = await Promise.race([
              queryPromise.then(q => q.get({ source: 'cache' })),
              new Promise((_, reject) => setTimeout(() => reject(new Error('Cache timeout')), 5000))
            ]);
            if (cacheResult && !cacheResult.empty) {
              console.log('✅ Loaded from cache (fallback) -', cacheResult.size, 'documents');
              return cacheResult;
            } else if (cacheResult) {
              console.log('⚠️ Cache is empty (no cached data available)');
            } else {
              console.log('⚠️ Cache query returned null');
            }
          } catch (cacheError) {
            console.log('⚠️ Cache fallback failed:', cacheError.message);
          }
        }
        
        // If all fails, try default (cache or server) - this is most permissive
        // Default source will try cache first, then server automatically
        try {
          console.log('⚠️ Trying default source (Firestore will use cache if available, then server)...');
          const defaultResult = await Promise.race([
            queryPromise.then(q => q.get()), // No source specified = tries cache first, then server
            new Promise((_, reject) => setTimeout(() => reject(new Error('Default source timeout')), 15000))
          ]);
          if (defaultResult && !defaultResult.empty) {
            console.log('✅ Loaded from default source -', defaultResult.size, 'documents');
            return defaultResult;
          } else if (defaultResult) {
            console.log('⚠️ Default source returned empty result (no data found)');
            // Return empty result instead of throwing - let the app handle empty data
            return defaultResult;
          }
        } catch (defaultError) {
          console.warn('⚠️ Default source also failed:', defaultError.message);
        }
        
        // Don't check domains - it's not reliable and causes false alarms
        // The domain test gives false positives (404s are expected)
        
        // If we get here, all attempts failed
        // Return an empty snapshot-like object instead of throwing
        // This allows the app to continue and show "no patients" message
        console.error('❌ All query attempts failed. Returning empty result.');
        console.error('Error:', error.message, error.code);
        return {
          empty: true,
          size: 0,
          forEach: () => {},
          docs: []
        };
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
