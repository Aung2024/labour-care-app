(function (root) {
  'use strict';

  function normalizeRole(role) {
    return String(role || '').trim().toLowerCase().replace(/\s+/g, ' ');
  }

  function landingPageForRole(role) {
    var key = normalizeRole(role);
    if (key === 'program officer' || key === 'programme officer') return 'program-officer.html';
    if (key === 'lab' || key === 'laboratory') return 'lab-vouchers.html';
    return 'home.html';
  }

  function isVoucherOnlyRole(role) {
    return landingPageForRole(role) !== 'home.html';
  }

  function persistPreferredHome(page) {
    if (typeof root.caches === 'undefined' || !root.caches.put && !root.caches.open) return;
    try {
      root.caches.open('mch-preferred-home').then(function (cache) {
        return cache.put('./__preferred-home', new Response(page || 'home.html', {
          headers: { 'Content-Type': 'text/plain' }
        }));
      }).catch(function () {});
    } catch (error) {}
  }

  function rememberRole(role) {
    try { root.localStorage.setItem('role', role || ''); } catch (error) {}
    persistPreferredHome(landingPageForRole(role));
  }

  function isLoggingOut() {
    try { return root.sessionStorage.getItem('mchLoggingOut') === '1'; } catch (error) { return false; }
  }

  function beginLogout() {
    try {
      root.sessionStorage.clear();
      root.sessionStorage.setItem('mchLoggingOut', '1');
    } catch (error) {}
    [
      'role', 'userEmail', 'userId', 'uid', 'rememberMe', 'userName',
      'userTownship', 'userRegion', 'providerType', 'sessionExpiry'
    ].forEach(function (key) {
      try { root.localStorage.removeItem(key); } catch (error) {}
    });
    if (root.caches && root.caches.delete) {
      root.caches.delete('mch-preferred-home').catch(function () {});
    }
  }

  function finishLogout() {
    try { root.sessionStorage.removeItem('mchLoggingOut'); } catch (error) {}
  }

  function goToLogin() {
    var page = '';
    try { page = String(root.location.pathname || '').split('/').pop(); } catch (error) { page = ''; }
    if (page === 'login.html') return;
    root.location.replace('login.html');
  }

  function cachedRole() {
    try { return root.localStorage.getItem('role') || ''; } catch (error) { return ''; }
  }

  function cachedLandingPage() {
    return landingPageForRole(cachedRole());
  }

  function fetchProfile(uid) {
    if (!root.firebase || !root.firebase.firestore || !uid) {
      return Promise.resolve(null);
    }
    return root.firebase.firestore().collection('users').doc(uid).get().then(function (snapshot) {
      return snapshot.exists ? snapshot.data() : null;
    }).catch(function () { return null; });
  }

  function resolveLandingPage(user) {
    if (!user) return Promise.resolve('login.html');
    return fetchProfile(user.uid).then(function (profile) {
      var role = (profile && profile.role) || cachedRole();
      if (role) rememberRole(role);
      return landingPageForRole(role);
    });
  }

  root.RoleLanding = Object.freeze({
    normalizeRole: normalizeRole,
    landingPageForRole: landingPageForRole,
    isVoucherOnlyRole: isVoucherOnlyRole,
    rememberRole: rememberRole,
    cachedRole: cachedRole,
    cachedLandingPage: cachedLandingPage,
    resolveLandingPage: resolveLandingPage,
    isLoggingOut: isLoggingOut,
    beginLogout: beginLogout,
    finishLogout: finishLogout,
    goToLogin: goToLogin
  });

  try {
    var currentPage = String(root.location.pathname || '').split('/').pop();
    if (currentPage === 'login.html' || currentPage === '') finishLogout();
  } catch (error) {}
})(typeof window !== 'undefined' ? window : globalThis);
