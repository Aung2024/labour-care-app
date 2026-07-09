/**
 * Role display labels — permissions stay on `role`; `provider_type` is label-only.
 * Midwife-level accounts may register as Midwife or Hospital (same RBAC).
 */
(function (global) {
  'use strict';

  var PROVIDER_TYPE_MIDWIFE = 'midwife';
  var PROVIDER_TYPE_HOSPITAL = 'hospital';

  function normalizeRoleKey(role) {
    return String(role || '').toLowerCase().trim().replace(/\s+/g, ' ');
  }

  function isMidwifeRole(role) {
    var key = normalizeRoleKey(role);
    return key === 'midwife' || key === '';
  }

  function normalizeProviderType(providerType) {
    var key = String(providerType || '').toLowerCase().trim();
    return key === PROVIDER_TYPE_HOSPITAL ? PROVIDER_TYPE_HOSPITAL : PROVIDER_TYPE_MIDWIFE;
  }

  function isHospitalProvider(userOrType) {
    if (userOrType && typeof userOrType === 'object') {
      return isMidwifeRole(userOrType.role) &&
        normalizeProviderType(userOrType.provider_type) === PROVIDER_TYPE_HOSPITAL;
    }
    return normalizeProviderType(userOrType) === PROVIDER_TYPE_HOSPITAL;
  }

  function getMidwifeLevelDisplayLabel(providerType) {
    return isHospitalProvider(providerType) ? 'Hospital' : 'Midwife';
  }

  /**
   * Human-readable role label for headers, admin tables, etc.
   * @param {string|object} roleOrUser - role string or user doc { role, provider_type }
   */
  function getRoleDisplayLabel(roleOrUser) {
    var role;
    var providerType;

    if (roleOrUser && typeof roleOrUser === 'object') {
      role = roleOrUser.role;
      providerType = roleOrUser.provider_type;
    } else {
      role = roleOrUser;
      providerType = global.localStorage ? localStorage.getItem('providerType') : null;
    }

    if (role === 'TMO') return 'Township Dashboard';
    if (normalizeRoleKey(role) === 'regional officer') return 'Regional Dashboard';
    if (isMidwifeRole(role)) return getMidwifeLevelDisplayLabel(providerType);
    return role || 'Midwife';
  }

  global.RoleDisplay = {
    PROVIDER_TYPE_MIDWIFE: PROVIDER_TYPE_MIDWIFE,
    PROVIDER_TYPE_HOSPITAL: PROVIDER_TYPE_HOSPITAL,
    isMidwifeRole: isMidwifeRole,
    isHospitalProvider: isHospitalProvider,
    getMidwifeLevelDisplayLabel: getMidwifeLevelDisplayLabel,
    getRoleDisplayLabel: getRoleDisplayLabel,
    normalizeProviderType: normalizeProviderType
  };
})(typeof window !== 'undefined' ? window : globalThis);
