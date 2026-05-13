/**
 * Page Performance Optimizations
 * Improves page load speed and navigation performance
 */

/**
 * Initialize performance optimizations
 */
function initPerformanceOptimizations() {
  // Track page load time (Navigation Timing Level 2; avoids bogus values from legacy timing)
  window.addEventListener('load', () => {
    let loadMs = null;
    try {
      const nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
      if (nav && typeof nav.loadEventEnd === 'number' && typeof nav.startTime === 'number') {
        loadMs = Math.round(nav.loadEventEnd - nav.startTime);
      } else if (window.performance && window.performance.timing) {
        const t = window.performance.timing;
        if (t.loadEventEnd > 0 && t.navigationStart > 0) {
          loadMs = t.loadEventEnd - t.navigationStart;
        }
      }
    } catch (e) {
      /* ignore */
    }
    if (loadMs != null && loadMs >= 0 && loadMs < 3600000) {
      console.log('📊 Page load time:', loadMs, 'ms');
    }
  });
  
  // Optimize back/forward navigation
  optimizeNavigation();
  
  // Preload common resources
  preloadCommonResources();
}

/**
 * Optimize browser navigation (back/forward button)
 */
function optimizeNavigation() {
  // Use pageshow event to detect back/forward navigation
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
      // Page was loaded from cache (back/forward navigation)
      console.log('✅ Page loaded from cache (back/forward navigation)');
      
      // Clear any stale data that might cause issues
      // But keep cached user data (it's still valid)
      
      // Force a lightweight refresh of critical data if needed
      // This is much faster than a full page reload
      refreshCriticalData();
    }
  });
  
  // Optimize page visibility changes
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      // Page is hidden - pause any unnecessary operations
      console.log('📱 Page hidden - pausing operations');
    } else {
      // Page is visible - resume operations
      console.log('📱 Page visible - resuming operations');
      // Optionally refresh stale data
      refreshStaleData();
    }
  });
}

/**
 * Refresh critical data (lightweight, fast)
 */
function refreshCriticalData() {
  // Only refresh if data is stale (older than 1 minute)
  const lastRefresh = sessionStorage.getItem('lastDataRefresh');
  const now = Date.now();
  
  if (!lastRefresh || (now - parseInt(lastRefresh)) > 60 * 1000) {
    // Refresh user data if needed
    const currentUser = firebase.auth().currentUser;
    if (currentUser && window.UserCache) {
      // Refresh user cache (uses cache first, so this is fast)
      window.UserCache.get(currentUser.uid, false).catch(() => {
        // Ignore errors - cache will be used
      });
    }
    
    sessionStorage.setItem('lastDataRefresh', now.toString());
  }
}

/**
 * Refresh stale data when page becomes visible
 */
function refreshStaleData() {
  // Only refresh if page was hidden for more than 5 minutes
  const hiddenTime = sessionStorage.getItem('pageHiddenTime');
  if (hiddenTime) {
    const hiddenDuration = Date.now() - parseInt(hiddenTime);
    if (hiddenDuration > 5 * 60 * 1000) {
      // Data might be stale, refresh
      refreshCriticalData();
    }
    sessionStorage.removeItem('pageHiddenTime');
  }
}

/**
 * Preload common resources
 */
function preloadCommonResources() {
  // Preload Firebase SDKs are already loaded
  // Preload common images/icons if needed
  // This is done automatically by the browser cache
}

/**
 * Debounce function to limit how often a function can be called
 */
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Throttle function to limit function execution rate
 */
function throttle(func, limit) {
  let inThrottle;
  return function(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

// Export functions
window.PagePerformance = {
  init: initPerformanceOptimizations,
  refreshCriticalData: refreshCriticalData,
  debounce: debounce,
  throttle: throttle
};

// Auto-initialize
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPerformanceOptimizations);
} else {
  initPerformanceOptimizations();
}

console.log('✅ Page Performance optimizations initialized');

