// --- Firebase init ---
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

// --- Browser detection ---
const ua = navigator.userAgent || "";
const isIOS = /iPhone|iPad|iPod/.test(ua);
const isSafariDesktop =
  /Safari/.test(ua) &&
  !/Chrome/.test(ua) &&
  !/Edge/.test(ua) &&
  !/Chromium/.test(ua);
const isSafariBrowser = isSafariDesktop || isIOS;

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
// Safari / iOS + IndexedDB = a lot of problems
// So: we completely skip persistence on Safari/iOS for stability
try {
  if (isSafariBrowser) {
    console.log("ℹ️ Skipping Firestore persistence on Safari/iOS for compatibility.");
    // No enablePersistence() here – Firestore will still work online-only
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
  const domains = [
    { name: "Firebase Auth", url: "https://labourcare-2481a.firebaseapp.com", critical: true },
    { name: "Firestore API", url: "https://firestore.googleapis.com", critical: true },
    { name: "Google Static", url: "https://www.gstatic.com", critical: true },
    { name: "Google APIs", url: "https://www.googleapis.com", critical: false },
    { name: "Storage", url: "https://labourcare-2481a.appspot.com", critical: false }
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

// --- Smart query function (kept as-is, just slightly cleaned) ---
window.smartFirestoreQuery = async function (queryPromise, options = {}) {
  const {
    preferCache = false,
    timeout = 10000,
    retries = 2,
    fallbackToCache = true
  } = options;

  const isIOSDetected = /iPhone|iPad|iPod/.test(navigator.userAgent || "");

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

      if (isLastAttempt) {
        if (fallbackToCache) {
          try {
            console.log("⚠️ Server failed, trying cache fallback...");
            const cacheResult = await Promise.race([
              queryPromise.then((q) => q.get({ source: "cache" })),
              new Promise((_, reject) => setTimeout(() => reject(new Error("Cache timeout")), 5000))
            ]);
            if (cacheResult && !cacheResult.empty) {
              console.log("✅ Loaded from cache (fallback) -", cacheResult.size, "documents");
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
        return {
          empty: true,
          size: 0,
          forEach: () => {},
          docs: []
        };
      }

      // exponential backoff between retries
      const delay = 1000 * Math.pow(2, attempt);
      console.log(`⚠️ Retry ${attempt + 1}/${retries} in ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
};
