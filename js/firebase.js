// --- Firebase init ---
var PILOT_FIREBASE_CONFIG = {
  apiKey: "AIzaSyC8-y2xnLINlVTWOOaU8-w82RBzSo2djAQ",
  authDomain: "labourcare-2481a.firebaseapp.com",
  projectId: "labourcare-2481a",
  storageBucket: "labourcare-2481a.appspot.com",
  messagingSenderId: "1033457212744",
  appId: "1:1033457212744:web:4d767eb4ef246b1090e77d"
};

var MOH_FIREBASE_CONFIG = {
  apiKey: "AIzaSyAAyhV6Wp9yQGxcpT1GZPbwEa676dwTMC4",
  authDomain: "mnch-1cbda.firebaseapp.com",
  projectId: "mnch-1cbda",
  storageBucket: "mnch-1cbda.firebasestorage.app",
  messagingSenderId: "166093206737",
  appId: "1:166093206737:web:247112e5f2cda369b841f0",
  measurementId: "G-3PRRVBTMEC",
  functionUrls: {
    queryHrtTracking: "/api/query-hrt-tracking",
    queryKmcTracking: "/api/query-kmc-tracking",
    sendHrtSms: "/api/send-hrt-sms"
  }
};

var RUNTIME_CONFIG_CACHE_KEY = "labourcare-firebase-runtime-config";

function currentHostname() {
  try {
    return String((typeof window !== "undefined" && window.location && window.location.hostname) || "").toLowerCase();
  } catch (error) {
    return "";
  }
}

function isMohDeployHost(hostname) {
  hostname = String(hostname || currentHostname());
  return hostname === "mnch-v2.netlify.app" || hostname === "www.mnch-v2.netlify.app";
}

function isLocalHost(hostname) {
  hostname = String(hostname || currentHostname());
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "";
}

function hostDefaultFirebaseConfig() {
  return isMohDeployHost() ? MOH_FIREBASE_CONFIG : PILOT_FIREBASE_CONFIG;
}

function isCompleteFirebaseConfig(parsed) {
  return !!(parsed && parsed.projectId && parsed.apiKey && parsed.appId);
}

function readCachedRuntimeFirebaseConfig() {
  if (typeof window === "undefined") return null;
  var stores = [];
  try { stores.push(window.sessionStorage); } catch (error) {}
  try { stores.push(window.localStorage); } catch (error) {}
  for (var i = 0; i < stores.length; i++) {
    try {
      var raw = stores[i].getItem(RUNTIME_CONFIG_CACHE_KEY);
      if (!raw) continue;
      var parsed = JSON.parse(raw);
      if (isCompleteFirebaseConfig(parsed)) return parsed;
    } catch (error) {}
  }
  return null;
}

function writeCachedRuntimeFirebaseConfig(config) {
  if (!isCompleteFirebaseConfig(config)) return;
  var raw = JSON.stringify(config);
  try { sessionStorage.setItem(RUNTIME_CONFIG_CACHE_KEY, raw); } catch (error) {}
  try { localStorage.setItem(RUNTIME_CONFIG_CACHE_KEY, raw); } catch (error) {}
}

function fetchRuntimeFirebaseConfigSync() {
  try {
    var req = new XMLHttpRequest();
    req.open("GET", "/firebase.runtime-config.json", false);
    req.send(null);
    if (req.status >= 200 && req.status < 300 && req.responseText) {
      var parsed = JSON.parse(req.responseText);
      if (isCompleteFirebaseConfig(parsed)) return parsed;
      console.warn("⚠️ Runtime Firebase config exists but is incomplete. Using embedded defaults.");
    }
  } catch (error) {
    // Expected when runtime config is not present.
  }
  return null;
}

function refreshRuntimeFirebaseConfigAsync() {
  if (typeof window === "undefined" || typeof window.fetch !== "function") return;
  window.fetch("/firebase.runtime-config.json", { cache: "no-store" })
    .then(function (response) {
      if (!response || !response.ok) return null;
      return response.json();
    })
    .then(function (parsed) {
      if (isCompleteFirebaseConfig(parsed)) writeCachedRuntimeFirebaseConfig(parsed);
    })
    .catch(function () {});
}

function loadRuntimeFirebaseConfig() {
  if (typeof window !== "undefined" && window.__LABOURCARE_FIREBASE_CONFIG__) {
    return window.__LABOURCARE_FIREBASE_CONFIG__;
  }

  var cached = readCachedRuntimeFirebaseConfig();
  if (cached) {
    refreshRuntimeFirebaseConfigAsync();
    return cached;
  }

  // Local/dev only: the JSON is same-origin and fast. Never block MOH phones
  // on a sync XHR — a timeout there used the pilot project and broke login.
  if (isLocalHost()) {
    var fromNetwork = fetchRuntimeFirebaseConfigSync();
    if (fromNetwork) writeCachedRuntimeFirebaseConfig(fromNetwork);
    refreshRuntimeFirebaseConfigAsync();
    return fromNetwork;
  }

  refreshRuntimeFirebaseConfigAsync();
  return null;
}

var defaultFirebaseConfig = hostDefaultFirebaseConfig();
var runtimeFirebaseConfig = loadRuntimeFirebaseConfig();
var firebaseConfig = runtimeFirebaseConfig || defaultFirebaseConfig;

if (runtimeFirebaseConfig && runtimeFirebaseConfig.projectId) {
  console.log("✅ Runtime Firebase config loaded for project:", runtimeFirebaseConfig.projectId);
} else {
  console.log("ℹ️ Using embedded Firebase project config:", defaultFirebaseConfig.projectId);
}

firebase.initializeApp(firebaseConfig);

// The bundled Auth SDK still calls the retired
// www.googleapis.com/identitytoolkit/v3/relyingparty/verifyPassword address.
// Some networks now receive a Google 404 for that path. Sign-in uses the
// current Identity Toolkit password endpoint instead.
(function rerouteLegacyPasswordSignIn() {
  var legacyPath = "/identitytoolkit/v3/relyingparty/verifyPassword";
  var currentEndpoint = "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword";
  var rewrite = function (url) {
    var text = String(url || "");
    if (text.indexOf(legacyPath) === -1) return url;
    var query = text.indexOf("?");
    return currentEndpoint + (query === -1 ? "" : text.slice(query));
  };
  if (typeof window.fetch === "function") {
    var originalFetch = window.fetch.bind(window);
    window.fetch = function (input, init) {
      if (typeof input === "string") return originalFetch(rewrite(input), init);
      if (input && typeof Request !== "undefined" && input instanceof Request && String(input.url).indexOf(legacyPath) !== -1) {
        return originalFetch(new Request(rewrite(input.url), input), init);
      }
      return originalFetch(input, init);
    };
  }
  if (typeof XMLHttpRequest !== "undefined") {
    var originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url) {
      var args = Array.prototype.slice.call(arguments);
      args[1] = rewrite(url);
      return originalOpen.apply(this, args);
    };
  }
})();

const db = firebase.firestore();

// --- Browser detection ---
const ua = navigator.userAgent || "";
const isIOS = /iPhone|iPad|iPod/.test(ua);
const isSafariDesktop =
  /Safari/.test(ua) &&
  !/Chrome/.test(ua) &&
  !/Edge/.test(ua) &&
  !/Chromium/.test(ua);
const isSafariBrowser = isSafariDesktop || isIOS;

function isAppleMobileOrTablet() {
  return /iPhone|iPad|iPod/i.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

// --- Firestore settings: force long polling for all browsers ---
// This helps when WebSockets are blocked by ISP / firewall.
// CRITICAL for Android native apps and networks with firewall restrictions
try {
  db.settings({
    experimentalForceLongPolling: true,
    // useFetchStreams can cause issues on some Safari versions, so keep it false
    useFetchStreams: false,
    cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED
  });
  console.log("✅ Firestore configured with long polling (bypasses WebSocket blocks)");
  console.log("✅ Long polling mode helps with: ISP blocks, firewalls, VPN issues, Android native apps");
} catch (error) {
  console.warn("⚠️ Firestore settings error (non-critical):", error);
}

// --- Offline persistence ---
// Safari / iOS IndexedDB persistence can be unstable and may break page loading.
// Keep Safari/iOS on network-only Firestore for reliability.
try {
  if (isSafariBrowser) {
    console.log("ℹ️ Skipping Firestore persistence on Safari/iOS for compatibility.");
  } else {
    db.enablePersistence({ synchronizeTabs: true }).catch((err) => {
      if (err.code === "failed-precondition") {
        console.warn("Persistence can only be enabled in one tab at a time.");
      } else if (err.code === "unimplemented") {
        console.warn("Persistence is not supported in this browser.");
      } else {
        console.warn("Error enabling persistence:", err);
      }
    });
  }
} catch (error) {
  console.warn("Persistence initialization error (non-critical):", error);
  // App continues without persistence
}

// --- Domain connectivity test (unchanged, but SAFE) ---
window.testFirebaseDomains = async function () {
  var authDomain = firebaseConfig.authDomain || defaultFirebaseConfig.authDomain;
  var storageBucket = firebaseConfig.storageBucket || defaultFirebaseConfig.storageBucket;
  const domains = [
    { name: "Firebase Auth", url: "https://" + authDomain, critical: true },
    { name: "Firestore API", url: "https://firestore.googleapis.com", critical: true },
    { name: "Google Static", url: "https://www.gstatic.com", critical: true },
    { name: "Google APIs", url: "https://www.googleapis.com", critical: false },
    { name: "Storage", url: "https://" + storageBucket, critical: false }
  ];

  const results = [];

  for (const domain of domains) {
    try {
      let accessible = false;
      let latency = 0;
      let errorMsg = "";
      const startTime = performance && performance.now ? performance.now() : Date.now();

      // Use Image trick only – it's less fragile on Safari
      await new Promise((resolve) => {
        const img = new Image();
        const timeout = setTimeout(() => {
          errorMsg = "Image load timeout";
          resolve();
        }, 3000);

        img.onload = () => {
          clearTimeout(timeout);
          resolve();
        };
        img.onerror = () => {
          // onerror still means DNS resolved and connection attempted
          clearTimeout(timeout);
          resolve();
        };
        img.src = domain.url + "/favicon.ico?" + Date.now();
      });

      latency = Math.round((performance && performance.now ? performance.now() : Date.now()) - startTime);
      accessible = true;

      results.push({
        name: domain.name,
        url: domain.url,
        accessible,
        latency,
        error: errorMsg,
        critical: domain.critical
      });
    } catch (error) {
      results.push({
        name: domain.name,
        url: domain.url,
        accessible: false,
        error: error.message || "Unknown error",
        critical: domain.critical
      });
    }
  }

  const criticalFailed = results.filter((r) => r.critical && !r.accessible);
  if (criticalFailed.length > 0) {
    console.log("ℹ️ Domain connectivity check:", criticalFailed.map((r) => r.name).join(", "));
    console.log("Note: 404 errors are NORMAL (Firebase doesn't serve content at root paths)");
    console.log("If app is not working, these are suggestions (not errors):");
    console.log("• Use VPN to bypass firewall");
    console.log("• Change DNS to 8.8.8.8 (Google) or 1.1.1.1 (Cloudflare)");
    console.log("• Use mobile data instead of WiFi");
  } else {
    const allAccessible = results.every((r) => r.accessible);
    if (allAccessible) {
      console.log("✅ All Firebase domains are accessible");
    } else {
      const nonCriticalFailed = results.filter((r) => !r.critical && !r.accessible);
      if (nonCriticalFailed.length > 0) {
        console.log(
          "ℹ️ Some non-critical domains may have issues:",
          nonCriticalFailed.map((r) => r.name).join(", ")
        );
      }
    }
  }

  return results;
};

var firestoreBackendUnavailableUntil = 0;

function isLikelyFirestoreUnavailableError(error) {
  if (!error) return false;
  var message = String(error.message || "");
  return error.code === "unavailable" ||
    error.code === "deadline-exceeded" ||
    message.indexOf("timeout") !== -1 ||
    message.indexOf("UNAVAILABLE") !== -1 ||
    message.indexOf("offline") !== -1 ||
    message.indexOf("Could not reach Cloud Firestore") !== -1 ||
    message.indexOf("Failed to get document") !== -1;
}

function noteFirestoreBackendIssue(error) {
  if (isLikelyFirestoreUnavailableError(error)) {
    firestoreBackendUnavailableUntil = Date.now() + 12000;
  }
}

function isFirestoreLikelyUnavailable() {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  return Date.now() < firestoreBackendUnavailableUntil;
}

function isUsableCacheResult(cacheResult) {
  if (!cacheResult || cacheResult._smartQueryFailed) return false;
  if (cacheResult.exists === true) return true;
  if (typeof cacheResult.size === "number") return cacheResult.size > 0;
  return cacheResult.empty === false;
}

function emptySmartQueryResult() {
  return {
    _smartQueryFailed: true,
    empty: true,
    size: 0,
    exists: undefined,
    forEach: function () {},
    docs: []
  };
}

// --- Smart query function (kept as-is, just slightly cleaned) ---
window.smartFirestoreQuery = async function (queryPromise, options = {}) {
  const {
    preferCache = false,
    timeout = 10000,
    retries = 2,
    fallbackToCache = true
  } = options;

  const isIOSDetected = isAppleMobileOrTablet();

  if (isFirestoreLikelyUnavailable()) {
    if (fallbackToCache) {
      try {
        const cacheResult = await Promise.race([
          queryPromise.then((q) => q.get({ source: "cache" })),
          new Promise((_, reject) => setTimeout(() => reject(new Error("Cache timeout")), 1500))
        ]);
        if (isUsableCacheResult(cacheResult)) {
          console.log("✅ Loaded from cache (offline/unavailable)");
          return cacheResult;
        }
      } catch (cacheError) {}
    }
    return emptySmartQueryResult();
  }

  // Prefer cache on iOS if requested
  if (preferCache && isIOSDetected) {
    try {
      const cacheResult = await Promise.race([
        queryPromise.then((q) => q.get({ source: "cache" })),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Cache timeout")), 2000))
      ]);
      if (cacheResult && !cacheResult.empty) {
        console.log("✅ Loaded from cache (iOS)");
        return cacheResult;
      }
    } catch (cacheError) {
      // cache miss, continue to server
    }
  }

  // Main server path with retries
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = await Promise.race([
        queryPromise.then((q) => q.get({ source: "server" })),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Server timeout")), timeout))
      ]);
      console.log("✅ Loaded from server");
      return result;
    } catch (error) {
      const isLastAttempt = attempt === retries;

      const isCORSError =
        error.message &&
        (error.message.includes("CORS") ||
          error.message.includes("cross-origin") ||
          error.message.includes("Access-Control"));

      const isNetworkError =
        error.message &&
        (error.message.includes("timeout") ||
          error.message.includes("Failed to get") ||
          error.message.includes("UNAVAILABLE") ||
          error.message.includes("network") ||
          error.code === "unavailable" ||
          error.code === "deadline-exceeded");

      noteFirestoreBackendIssue(error);

      if (isLastAttempt) {
        if (fallbackToCache) {
          try {
            console.log("⚠️ Server failed, trying cache fallback...");
            const cacheResult = await Promise.race([
              queryPromise.then((q) => q.get({ source: "cache" })),
              new Promise((_, reject) => setTimeout(() => reject(new Error("Cache timeout")), 1500))
            ]);
            if (isUsableCacheResult(cacheResult)) {
              console.log("✅ Loaded from cache (fallback) -", cacheResult.size != null ? cacheResult.size : 1, "documents");
              return cacheResult;
            } else if (cacheResult) {
              console.log("⚠️ Cache is empty (no cached data available)");
            }
          } catch (cacheError) {
            console.log("⚠️ Cache fallback failed:", cacheError.message);
          }
        }

        if (isCORSError) {
          try {
            console.log("⚠️ CORS error detected - trying default source (Safari fallback)...");
            const defaultResult = await Promise.race([
              queryPromise.then((q) => q.get()), // default source
              new Promise((_, reject) => setTimeout(() => reject(new Error("Default source timeout")), 8000))
            ]);
            if (defaultResult && !defaultResult.empty) {
              console.log("✅ Loaded from default source (Safari fallback) -", defaultResult.size, "documents");
              return defaultResult;
            }
          } catch (defaultError) {
            console.warn("⚠️ Default source also failed:", defaultError.message);
          }
        }

        console.error("❌ All query attempts failed. Returning empty result.");
        console.error("Error:", error.message, error.code);
        return emptySmartQueryResult();
      }

      if (isFirestoreLikelyUnavailable()) {
        if (fallbackToCache) {
          try {
            const cacheResult = await Promise.race([
              queryPromise.then((q) => q.get({ source: "cache" })),
              new Promise((_, reject) => setTimeout(() => reject(new Error("Cache timeout")), 1500))
            ]);
            if (isUsableCacheResult(cacheResult)) return cacheResult;
          } catch (cacheError) {}
        }
        return emptySmartQueryResult();
      }

      // exponential backoff between retries
      const delay = 1000 * Math.pow(2, attempt);
      console.log(`⚠️ Retry ${attempt + 1}/${retries} in ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
};

window.isFirestoreLikelyUnavailable = isFirestoreLikelyUnavailable;
window.noteFirestoreBackendIssue = noteFirestoreBackendIssue;
window.isLikelyFirestoreUnavailableError = isLikelyFirestoreUnavailableError;
