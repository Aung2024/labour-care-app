# Security Configuration Document

## 🔒 Current Security Configuration

This document details the current security configuration of the Labour Care Application for VAPT testing preparation.

---

## 1. Authentication & Authorization

### Authentication Method
- **Provider**: Firebase Authentication
- **Methods Supported**: Email/Password
- **Session Management**: Custom session manager with Firebase tokens

### Session Configuration
```javascript
SESSION_CONFIG = {
  INACTIVITY_TIMEOUT: 15 * 60 * 1000,  // 15 minutes
  WARNING_TIME: 2 * 60 * 1000,         // 2 minutes warning
  TOKEN_REFRESH_INTERVAL: 50 * 60 * 1000 // 50 minutes
}
```

### Account Lockout Configuration
```javascript
LOCKOUT_CONFIG = {
  maxAttempts: 5,
  lockoutDuration: 60 * 60 * 1000,  // 1 hour
  exponentialBackoff: false
}
```

### Password Policy
- **Minimum Length**: 8 characters
- **Complexity**: Not enforced (consider for future)
- **History**: Last 5 passwords cannot be reused
- **Strength Indicator**: Visual feedback

### Role-Based Access Control (RBAC)

#### Roles Defined
1. **Super Admin**
   - Full access to all patients
   - User management (approve/reject accounts)
   - Access to all reports
   - Admin dashboard access

2. **TMO (Township Medical Officer)**
   - Access to patients in their township
   - View reports for township
   - Manage settings

3. **Midwife**
   - Access to own patients only
   - Create patient records
   - Enter care data
   - View own reports

#### Permission Matrix
```javascript
PERMISSION_MATRIX = {
  'Super Admin': {
    can: ['manage_users', 'view_all_patients', 'edit_all_patients', 
          'manage_settings', 'view_reports', 'approve_accounts', 
          'access_admin_dashboard'],
    inherits: ['TMO']
  },
  'TMO': {
    can: ['view_township_patients', 'edit_township_patients', 
          'view_reports', 'manage_settings'],
    inherits: ['Midwife']
  },
  'Midwife': {
    can: ['create_patient', 'view_own_patients', 'edit_own_patients', 
          'enter_care_data', 'manage_settings', 'view_cme'],
    inherits: []
  }
}
```

**Status**: ⚠️ Frontend UI enforcement in progress, Firestore rules need strengthening

---

## 2. Data Protection

### Encryption

#### Data in Transit
- **Protocol**: HTTPS/TLS 1.2+
- **Provider**: Firebase Hosting (automatic)
- **Certificate**: Let's Encrypt (managed by Firebase)

#### Data at Rest
- **Provider**: Firebase Firestore
- **Encryption**: AES-256 (Firebase managed)
- **Backup Encryption**: Enabled

### Sensitive Data Masking

#### Masking Configuration
```javascript
// Phone numbers: 09 XXX XXX 678
// Names: Aung *** M.
// Addresses: Village, ***
```

#### Masking Toggle
- **Location**: Patient list page
- **State**: Persisted in localStorage
- **Default**: Masking disabled (show full data)

### Data Validation

#### Clinical Validation Rules
- **EDD/LMP Consistency**: EDD must be ~280 days after LMP
- **Gestational Age**: Must be consistent with LMP and visit date
- **Date Validation**: No future dates allowed
- **Age Consistency**: Age must match date of birth
- **Newborn Timeline**: Birth date must be within realistic window

#### Input Validation
- **Client-Side**: HTML5 validation + JavaScript validation
- **Server-Side**: Firestore rules (needs review)
- **Sanitization**: ⚠️ Needs review for XSS prevention

---

## 3. Audit & Compliance

### Audit Logging

#### Events Logged
- Login success/failure
- Logout
- Account lockout
- Patient record creation
- Patient record updates
- Duplicate checks
- Consent collection
- Security events

#### Log Structure
```javascript
{
  userId: string,
  timestamp: Timestamp,
  action: string,
  resource: string,
  details: object,
  ipAddress: string (if available),
  userAgent: string (if available)
}
```

#### Log Storage
- **Collection**: `audit_logs`
- **Immutability**: No updates/deletes allowed
- **Retention**: Indefinite (for compliance)

### Consent Management

#### Provider Consent (Level 1)
- **Required**: Before account use
- **Frequency**: Every 3 months or after major updates
- **Storage**: `provider_consents/{userId}`
- **Fields**: userId, consentVersion, timestamp, ipAddress, userAgent

#### Patient Consent (Level 2)
- **Required**: Before creating patient record
- **Methods**: Digital signature, verbal consent, refusal
- **Storage**: `patients/{patientId}/consents/{consentId}`
- **Fields**: patientId, providerId, consentVersion, method, signature/notes, timestamp

---

## 4. Firestore Security Rules

### Current Rules Summary

#### Users Collection
```javascript
// Users can read/write their own data
// Super Admin can read/write all user data
// TMO can read users in their township
```

#### Patients Collection
```javascript
// Authenticated users can read/write patient documents
// ⚠️ Needs strengthening for role-based access
```

#### Provider Consents
```javascript
// Users can read/write their own consent
// Super Admin can read all consents
```

#### Patient Consents
```javascript
// Authenticated providers can read consent records
// Users can write consent if they are the provider
// Super Admin can write any consent
```

#### Audit Logs
```javascript
// Authenticated users can create audit logs (for their own actions)
// Super Admin can read all audit logs
// Users can read their own audit logs
// No updates or deletes allowed (immutable)
```

#### Account Lockouts
```javascript
// Allow unauthenticated create/update (for lockout mechanism)
// Users can read their own lockout status
// Super Admin can read all lockouts
```

#### Password History
```javascript
// Users can create/update their own password history
// Users can read their own password history
// No deletes allowed
```

**Status**: ⚠️ Needs review and strengthening for RBAC

---

## 5. Application Security

### Security Headers

#### Current Status
- **HTTPS**: Enforced (Firebase hosting)
- **CSP**: ⚠️ Not implemented (needs implementation)
- **X-Frame-Options**: ⚠️ Not set (needs implementation)
- **X-Content-Type-Options**: ⚠️ Not set (needs implementation)
- **Strict-Transport-Security**: ⚠️ Not set (needs implementation)

### Input Sanitization

#### Current Status
- **HTML5 Validation**: ✅ Enabled
- **JavaScript Validation**: ✅ Enabled
- **XSS Prevention**: ⚠️ Needs review
- **Injection Prevention**: ⚠️ Needs review

### Error Handling

#### Current Status
- **Generic Error Messages**: ⚠️ Partial (needs review)
- **Error Logging**: ✅ Enabled
- **Information Leakage**: ⚠️ Needs review

---

## 6. Network Security

### CORS Configuration
- **Status**: ⚠️ Needs review
- **Allowed Origins**: Should be restricted to app domain
- **Allowed Methods**: Should be restricted to necessary methods

### Rate Limiting
- **Status**: ⚠️ Not implemented (Firebase may have default limits)
- **Recommendation**: Implement rate limiting for API calls

---

## 7. Client-Side Security

### JavaScript Security
- **Sensitive Data**: ⚠️ Review for API keys, secrets
- **Source Code**: Minified in production (Firebase hosting)
- **Third-Party Libraries**: Review for vulnerabilities

### Browser Storage
- **localStorage**: Used for user preferences, masking state
- **sessionStorage**: Used for temporary patient data
- **Sensitive Data**: ⚠️ Review for sensitive data storage

### Cookies
- **Firebase Auth Cookies**: Managed by Firebase
- **Custom Cookies**: None
- **Security**: ⚠️ Review cookie security settings

---

## 8. Known Security Considerations

### Strengths
- ✅ Firebase Authentication (industry standard)
- ✅ HTTPS/TLS encryption
- ✅ Comprehensive audit logging
- ✅ Consent management
- ✅ Account lockout mechanism
- ✅ Session timeout
- ✅ Data masking

### Areas for Improvement
- ⚠️ RBAC not fully implemented (frontend UI in progress)
- ⚠️ Firestore rules need strengthening
- ⚠️ Security headers not implemented
- ⚠️ Input sanitization needs review
- ⚠️ XSS prevention needs verification
- ⚠️ Error handling needs review
- ⚠️ CORS configuration needs review

---

## 9. Compliance Considerations

### Data Protection
- **GDPR**: ⚠️ Review for GDPR compliance (if applicable)
- **HIPAA**: ⚠️ Review for HIPAA compliance (if applicable)
- **Local Laws**: ⚠️ Review Myanmar data protection laws

### Privacy
- ✅ Privacy policy implemented
- ✅ Consent management implemented
- ✅ Data masking implemented
- ⚠️ Data retention policy (needs definition)

---

## 10. Security Testing Status

### Completed
- ✅ Authentication enforcement testing
- ✅ Session timeout testing
- ✅ Account lockout testing
- ✅ Duplicate detection testing
- ✅ Clinical validation testing
- ✅ Data masking testing

### Pending
- ⚠️ RBAC testing (waiting for completion)
- ⚠️ Firestore rules testing
- ⚠️ XSS testing
- ⚠️ Injection testing
- ⚠️ Security headers testing
- ⚠️ CORS testing

---

## 11. Recommendations for VAPT

### Before VAPT
1. Complete RBAC frontend UI
2. Strengthen Firestore rules
3. Implement security headers
4. Review input sanitization
5. Test Firestore rules with different roles

### During VAPT
1. Provide test environment
2. Provide test user accounts
3. Monitor for issues
4. Document findings

### After VAPT
1. Review vulnerability report
2. Prioritize remediation
3. Fix critical vulnerabilities
4. Re-test if needed

---

**Last Updated**: Current Date
**Status**: Pre-VAPT Preparation
**Next Review**: After VAPT testing

