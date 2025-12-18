/**
 * Network Diagnostics for Firebase Connectivity
 * Helps identify why Firebase connections fail on certain networks/devices
 */

// Test Firebase connectivity
async function testFirebaseConnectivity() {
  const results = {
    timestamp: new Date().toISOString(),
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    connectionType: getConnectionType(),
    tests: {}
  };

  console.log('🔍 Starting Firebase Connectivity Diagnostics...');
  console.log('Platform:', results.platform);
  console.log('User Agent:', results.userAgent);
  console.log('Connection Type:', results.connectionType);

  // Test 1: DNS Resolution
  results.tests.dnsResolution = await testDNSResolution();
  
  // Test 2: Firebase Auth Domain
  results.tests.firebaseAuthDomain = await testDomainConnectivity('labourcare-2481a.firebaseapp.com');
  
  // Test 3: Firebase Firestore API
  results.tests.firestoreAPI = await testDomainConnectivity('firestore.googleapis.com');
  
  // Test 4: Google Static Content
  results.tests.googleStatic = await testDomainConnectivity('www.gstatic.com');
  
  // Test 5: Firebase SDK Load
  results.tests.firebaseSDK = await testFirebaseSDKLoad();
  
  // Test 6: Firestore Connection
  results.tests.firestoreConnection = await testFirestoreConnection();
  
  // Test 7: Network Information
  results.tests.networkInfo = getNetworkInformation();

  console.log('📊 Diagnostic Results:', results);
  return results;
}

// Test DNS resolution
async function testDNSResolution() {
  try {
    const startTime = performance.now();
    const response = await fetch('https://labourcare-2481a.firebaseapp.com/.well-known/security.txt', {
      method: 'HEAD',
      mode: 'no-cors',
      cache: 'no-cache'
    });
    const endTime = performance.now();
    return {
      success: true,
      latency: Math.round(endTime - startTime),
      message: 'DNS resolution successful'
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      code: error.code,
      message: 'DNS resolution failed - Domain may be blocked'
    };
  }
}

// Test domain connectivity
async function testDomainConnectivity(domain) {
  try {
    const startTime = performance.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    try {
      const response = await fetch(`https://${domain}`, {
        method: 'HEAD',
        mode: 'no-cors',
        signal: controller.signal,
        cache: 'no-cache'
      });
      clearTimeout(timeoutId);
      const endTime = performance.now();
      return {
        success: true,
        latency: Math.round(endTime - startTime),
        domain: domain,
        message: 'Domain is reachable'
      };
    } catch (fetchError) {
      clearTimeout(timeoutId);
      throw fetchError;
    }
  } catch (error) {
    return {
      success: false,
      domain: domain,
      error: error.message,
      message: `Cannot reach ${domain} - May be blocked by firewall/proxy`
    };
  }
}

// Test Firebase SDK load
async function testFirebaseSDKLoad() {
  try {
    if (typeof firebase === 'undefined') {
      return {
        success: false,
        message: 'Firebase SDK not loaded'
      };
    }
    
    if (typeof firebase.firestore === 'undefined') {
      return {
        success: false,
        message: 'Firestore SDK not loaded'
      };
    }
    
    return {
      success: true,
      message: 'Firebase SDK loaded successfully',
      version: firebase.SDK_VERSION || 'unknown'
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      message: 'Firebase SDK load test failed'
    };
  }
}

// Test Firestore connection
async function testFirestoreConnection() {
  try {
    if (!firebase || !firebase.firestore) {
      return {
        success: false,
        message: 'Firebase not initialized'
      };
    }
    
    const db = firebase.firestore();
    const startTime = performance.now();
    
    // Try to connect to Firestore (this will fail if network is blocked)
    const testDocRef = db.collection('_test').doc('connectivity');
    
    try {
      await testDocRef.get({ source: 'server' });
      const endTime = performance.now();
      return {
        success: true,
        latency: Math.round(endTime - startTime),
        message: 'Firestore connection successful'
      };
    } catch (firestoreError) {
      // Check error code
      const errorCode = firestoreError.code || firestoreError.message;
      return {
        success: false,
        error: firestoreError.message,
        code: errorCode,
        message: 'Firestore connection failed',
        details: getFirestoreErrorDetails(firestoreError)
      };
    }
  } catch (error) {
    return {
      success: false,
      error: error.message,
      message: 'Firestore connection test failed'
    };
  }
}

// Get Firestore error details
function getFirestoreErrorDetails(error) {
  const details = {
    message: error.message,
    code: error.code,
    stack: error.stack
  };
  
  // Common error patterns
  if (error.message.includes('Failed to get document from server')) {
    details.issue = 'Network blocked - Cannot reach Firebase servers';
    details.possibleCauses = [
      'Government firewall blocking Firebase domains',
      'WiFi provider blocking Google services',
      'Corporate proxy blocking external connections',
      'DNS resolution failure'
    ];
    details.solutions = [
      'Try using mobile data instead of WiFi',
      'Check if VPN is needed',
      'Contact network administrator',
      'Verify DNS settings'
    ];
  } else if (error.message.includes('PERMISSION_DENIED')) {
    details.issue = 'Permission denied';
  } else if (error.message.includes('UNAVAILABLE')) {
    details.issue = 'Firebase service unavailable';
  } else if (error.message.includes('DEADLINE_EXCEEDED')) {
    details.issue = 'Connection timeout';
  }
  
  return details;
}

// Get connection type
function getConnectionType() {
  if (navigator.connection) {
    return {
      effectiveType: navigator.connection.effectiveType,
      downlink: navigator.connection.downlink,
      rtt: navigator.connection.rtt,
      saveData: navigator.connection.saveData
    };
  } else if (navigator.mozConnection) {
    return {
      effectiveType: navigator.mozConnection.effectiveType,
      downlink: navigator.mozConnection.downlink,
      rtt: navigator.mozConnection.rtt
    };
  } else if (navigator.webkitConnection) {
    return {
      effectiveType: navigator.webkitConnection.effectiveType,
      downlink: navigator.webkitConnection.downlink,
      rtt: navigator.webkitConnection.rtt
    };
  }
  return { message: 'Connection API not available' };
}

// Get network information
function getNetworkInformation() {
  return {
    onLine: navigator.onLine,
    language: navigator.language,
    platform: navigator.platform,
    cookieEnabled: navigator.cookieEnabled,
    doNotTrack: navigator.doNotTrack,
    hardwareConcurrency: navigator.hardwareConcurrency,
    deviceMemory: navigator.deviceMemory || 'unknown'
  };
}

// Display diagnostic results
function displayDiagnosticResults(results) {
  const container = document.createElement('div');
  container.id = 'network-diagnostics';
  container.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.9);
    color: white;
    padding: 2rem;
    overflow-y: auto;
    z-index: 10000;
    font-family: monospace;
    font-size: 12px;
  `;
  
  let html = '<h2>🔍 Firebase Connectivity Diagnostics</h2>';
  html += '<button onclick="document.getElementById(\'network-diagnostics\').remove()" style="float: right; padding: 0.5rem 1rem; margin-bottom: 1rem;">Close</button>';
  html += '<div style="clear: both;"></div>';
  
  html += '<h3>System Information</h3>';
  html += `<pre>Platform: ${results.platform}\nUser Agent: ${results.userAgent}\nConnection: ${JSON.stringify(results.connectionType, null, 2)}</pre>`;
  
  html += '<h3>Test Results</h3>';
  for (const [testName, testResult] of Object.entries(results.tests)) {
    const status = testResult.success ? '✅' : '❌';
    html += `<div style="margin: 1rem 0; padding: 1rem; background: ${testResult.success ? '#0a5' : '#a05'}; border-radius: 4px;">`;
    html += `<strong>${status} ${testName}</strong><br>`;
    html += `<pre>${JSON.stringify(testResult, null, 2)}</pre>`;
    html += '</div>';
  }
  
  html += '<h3>Full Results (JSON)</h3>';
  html += `<pre style="background: #333; padding: 1rem; border-radius: 4px; overflow-x: auto;">${JSON.stringify(results, null, 2)}</pre>`;
  
  container.innerHTML = html;
  document.body.appendChild(container);
}

// Make functions globally available
window.testFirebaseConnectivity = testFirebaseConnectivity;
window.displayDiagnosticResults = displayDiagnosticResults;

