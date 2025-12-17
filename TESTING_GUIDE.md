# Testing Guide - Security Features

## 🎯 Quick Start Testing

### 1. Fix Patient Registration Error First

The error `window.DuplicateDetector.logCheck is not a function` has been fixed. Make sure you have the latest `js/duplicate-detector.js` file with the `logCheck` function.

**To verify the fix:**
1. Open `js/duplicate-detector.js`
2. Check that it exports `logCheck` function (should be around line 370)
3. Clear browser cache and reload

---

## 📋 Step-by-Step Testing

### Test 1: Authentication Enforcement ✅

**What to test:** Pages should not be accessible without login

**Steps:**
1. Open browser in **incognito/private mode**
2. Type in address bar: `your-app-url.netlify.app/index.html`
3. **Expected Result:** Redirected to `login.html`
4. Try accessing other pages directly:
   - `list.html`
   - `patient-enhanced.html`
   - `antenatal-form.html`
5. **Expected Result:** All redirect to `login.html`

**Success Criteria:** ✅ No page accessible without authentication

---

### Test 2: Account Lockout ✅

**What to test:** Account should lock after 5 failed login attempts

**Steps:**
1. Go to `login.html`
2. Enter correct email but **wrong password** 5 times
3. **Expected Result:** 
   - After 5th attempt: "Account locked" message
   - Shows lockout duration (1 hour)
4. Try to login again immediately
5. **Expected Result:** "Account is locked" error
6. Check Firestore Console:
   - Collection: `account_lockouts`
   - Document: `{userId}`
   - **Expected:** Document exists with `lockedUntil` timestamp

**Success Criteria:** ✅ Account locks after 5 failed attempts, unlocks after 1 hour

---

### Test 3: Session Timeout ✅

**What to test:** User should be logged out after 15 minutes of inactivity

**Steps:**
1. Login to the application
2. **Don't move mouse or type anything** for 13 minutes
3. **Expected Result:** Warning popup appears: "Your session will expire in 2 minutes"
4. Options:
   - Click "Stay Logged In" → Session extended
   - Wait 2 more minutes → Auto-logout
5. **Expected Result:** Redirected to `login.html`

**Success Criteria:** ✅ Warning at 13 minutes, logout at 15 minutes

---

### Test 4: Duplicate Detection ✅

**What to test:** System should detect duplicate patients

**Steps:**
1. Register a patient:
   - Name: "Test Patient"
   - Age: 25
   - Phone: `09123456789`
2. Click "Register Patient"
3. Complete consent and save
4. Try to register **another patient** with:
   - Same phone: `09123456789`
   - OR Same name "Test Patient" + Age 26 (within ±2 years)
5. **Expected Result:** 
   - Duplicate warning modal appears
   - Shows existing patient(s)
   - Options: "Use This Patient" or "Create New Patient"
6. If "Create New Patient":
   - **Expected:** Prompt for justification (required)
7. Check Firestore:
   - Collection: `audit_logs`
   - **Expected:** Log entry for duplicate check

**Success Criteria:** ✅ Duplicates detected, user can link or create new with justification

---

### Test 5: Clinical Validation in ANC Form ✅

**What to test:** ANC form should validate clinical data

**Steps:**
1. Open ANC form for a patient (`antenatal-form.html?patient={patientId}`)
2. Enter **future visit date**: `2026-12-31`
3. Click "Save Visit Data"
4. **Expected Result:** Error: "Visit date cannot be in the future"
5. Enter valid visit date: `2025-12-18`
6. Enter LMP: `2025-01-01`
7. Enter EDD: `2024-10-01` (before LMP - invalid)
8. Click "Save Visit Data"
9. **Expected Result:** Warning: "EDD should be approximately 280 days (40 weeks) after LMP"
10. Choose to continue anyway or fix dates

**Success Criteria:** ✅ Future dates blocked, EDD/LMP consistency checked

---

### Test 6: Data Masking ✅

**What to test:** Sensitive data should be maskable in list views

**Steps:**
1. Go to patient list (`list.html`)
2. **Expected Result:** See "Hide Sensitive Data" toggle button (top right of search section)
3. Click the toggle
4. **Expected Result:** 
   - Button changes to "Show Sensitive Data"
   - Patient names masked (e.g., "Aung *** M.")
5. Click toggle again
6. **Expected Result:** Full names shown again
7. Refresh page
8. **Expected Result:** Masking state persists (saved in localStorage)

**Success Criteria:** ✅ Toggle works, names masked, state persists

---

### Test 7: Data Linkage (LMP/EDD Sync) ✅

**What to test:** LMP/EDD should sync to patient document

**Steps:**
1. Open ANC form for a patient
2. Enter LMP: `2025-01-15`
3. EDD should auto-calculate (or enter manually)
4. Click "Save Visit Data"
5. Wait for save to complete
6. Open Firestore Console:
   - Collection: `patients`
   - Document: `{patientId}`
   - Check fields: `lmp` and `edd`
7. **Expected Result:** `lmp` and `edd` fields updated in patient document
8. Open labour care setup for same patient
9. **Expected Result:** LMP/EDD should be available from patient document

**Success Criteria:** ✅ LMP/EDD synced to patient document, accessible in other forms

---

### Test 8: Provider Consent ✅

**What to test:** Provider must consent before using account

**Steps:**
1. Create a new user account (or use account that hasn't consented)
2. Login
3. **Expected Result:** Redirected to `provider-consent.html`
4. Read consent text
5. Click "I Agree"
6. **Expected Result:** Redirected to `index.html`
7. Check Firestore:
   - Collection: `provider_consents`
   - Document: `{userId}`
   - **Expected:** Consent record with timestamp, version, IP

**Success Criteria:** ✅ Consent required, recorded in Firestore

---

### Test 9: Patient Consent ✅

**What to test:** Patient consent required before registration

**Steps:**
1. Start patient registration (`patient-enhanced.html`)
2. Fill in patient details
3. Click "Register Patient"
4. **Expected Result:** Redirected to `patient-consent.html`
5. Choose consent method:
   - **Digital Signature:** Draw signature, enter patient name
   - **Verbal Consent:** Check box, enter provider notes
   - **Refusal:** Click "Refuse Consent"
6. Complete consent
7. **Expected Result:** Redirected to `index.html`
8. Check Firestore:
   - Collection: `patients/{patientId}/consents`
   - **Expected:** Consent record with method, provider ID, timestamp

**Success Criteria:** ✅ Consent required, recorded in Firestore

---

### Test 10: Audit Logging ✅

**What to test:** Key events should be logged

**Steps:**
1. Perform various actions:
   - Login
   - Register patient
   - Save ANC visit
   - Check for duplicates
2. Open Firestore Console:
   - Collection: `audit_logs`
3. **Expected Result:** Log entries for:
   - `login_success`
   - `patient_created`
   - `duplicate_check_checked`
   - `anc_visit_saved`
4. Check log structure:
   - `userId`
   - `timestamp`
   - `action`
   - `resource`
   - `details`

**Success Criteria:** ✅ All key events logged with proper structure

---

### Test 11: Performance (Caching) ✅

**What to test:** User data should be cached for faster page loads

**Steps:**
1. Open `index.html`
2. Open browser DevTools → Network tab
3. Navigate to `list.html`
4. Click browser back button
5. **Expected Result:** 
   - Fast page load
   - Console shows: "User data loaded from cache"
   - No Firestore query in Network tab (for user data)

**Success Criteria:** ✅ User data cached, faster navigation

---

### Test 12: iOS/Safari Compatibility ✅

**What to test:** App should work on iOS/Safari without errors

**Steps:**
1. Open app on iPhone/iPad Safari
2. Open Safari DevTools (if available) or check console
3. **Expected Result:** No "IndexedDB" errors
4. Test duplicate detection
5. **Expected Result:** Works without hanging
6. Test consent pages
7. **Expected Result:** No "processing" stuck state
8. Navigate between pages
9. **Expected Result:** Smooth navigation, no errors

**Success Criteria:** ✅ No iOS/Safari-specific errors

---

## 🐛 Troubleshooting

### Error: "DuplicateDetector.logCheck is not a function"
**Solution:** Make sure `js/duplicate-detector.js` has the `logCheck` function exported. Clear browser cache.

### Error: "Cannot log audit event"
**Solution:** Check Firestore rules for `audit_logs` collection. Should allow unauthenticated create for certain actions.

### Pages not loading after auth guard
**Solution:** Check browser console for errors. Auth guard may need a small delay. Clear cache and reload.

### Account lockout not working
**Solution:** Check Firestore rules for `account_lockouts` collection. Should allow unauthenticated create/update.

### Data masking not working
**Solution:** Check that `js/data-masking.js` is loaded before `list.html` scripts. Check browser console for errors.

---

## ✅ Test Results Template

```
Test 1: Authentication Enforcement - [ ] Pass [ ] Fail
Test 2: Account Lockout - [ ] Pass [ ] Fail
Test 3: Session Timeout - [ ] Pass [ ] Fail
Test 4: Duplicate Detection - [ ] Pass [ ] Fail
Test 5: Clinical Validation - [ ] Pass [ ] Fail
Test 6: Data Masking - [ ] Pass [ ] Fail
Test 7: Data Linkage - [ ] Pass [ ] Fail
Test 8: Provider Consent - [ ] Pass [ ] Fail
Test 9: Patient Consent - [ ] Pass [ ] Fail
Test 10: Audit Logging - [ ] Pass [ ] Fail
Test 11: Performance - [ ] Pass [ ] Fail
Test 12: iOS/Safari - [ ] Pass [ ] Fail
```

---

## 📞 Support

If you encounter issues during testing:
1. Check browser console for errors
2. Check Firestore console for data
3. Verify all JavaScript files are loaded
4. Clear browser cache and reload
5. Check Firestore rules are published

---

**Last Updated**: Current Date

