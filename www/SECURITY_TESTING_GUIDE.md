# Security Features Testing Guide

## 🔧 Firestore Rules Update

### ✅ Rules Already Updated
The Firestore rules have been updated in `firestore.rules` with the following new collections:
- `audit_logs` - For audit trail
- `account_lockouts` - For account lockout tracking
- `password_history` - For password history

### 📤 Deploy Firestore Rules

**You need to deploy the updated rules to Firebase:**

1. **Using Firebase CLI** (Recommended):
```bash
# Install Firebase CLI if not already installed
npm install -g firebase-tools

# Login to Firebase
firebase login

# Deploy rules
firebase deploy --only firestore:rules
```

2. **Using Firebase Console** (Web UI):
   - Go to [Firebase Console](https://console.firebase.google.com)
   - Select your project: `labourcare-2481a`
   - Go to **Firestore Database** → **Rules** tab
   - Copy the contents of `firestore.rules`
   - Paste into the rules editor
   - Click **Publish**

3. **Verify Rules Are Deployed**:
   - Check Firebase Console → Firestore → Rules
   - Rules should show the new collections: `audit_logs`, `account_lockouts`, `password_history`

---

## 🧪 Testing Guide

### 1. Session Management & Timeout Testing

#### Test 1.1: Session Activity Tracking
**Steps**:
1. Log in to the app
2. Open browser console (F12)
3. Type: `SessionManager.getInfo()`
4. You should see session information including:
   - `isActive: true`
   - `sessionDuration`: minutes since login
   - `timeUntilTimeout`: minutes until timeout

**Expected Result**: Session info displayed correctly

---

#### Test 1.2: Inactivity Warning (5 minutes before timeout)
**Steps**:
1. Log in to the app
2. Open browser console
3. Temporarily change timeout for testing:
   ```javascript
   SessionManager.CONFIG.INACTIVITY_TIMEOUT = 6 * 60 * 1000; // 6 minutes
   SessionManager.CONFIG.WARNING_TIME = 1 * 60 * 1000; // 1 minute warning
   ```
4. Wait 5 minutes without any activity (don't move mouse, don't type)
5. After 5 minutes, you should see a yellow warning banner at the top

**Expected Result**: Warning banner appears saying "Your session will expire in 1 minute"

---

#### Test 1.3: Session Extension
**Steps**:
1. When warning banner appears (from Test 1.2)
2. Click "Stay Logged In" button OR click anywhere on the page
3. Warning should disappear
4. Session should be extended

**Expected Result**: Warning disappears, session continues

---

#### Test 1.4: Auto-Logout on Timeout
**Steps**:
1. Log in to the app
2. Temporarily change timeout for testing:
   ```javascript
   SessionManager.CONFIG.INACTIVITY_TIMEOUT = 2 * 60 * 1000; // 2 minutes
   ```
3. Wait 2 minutes without any activity
4. You should be automatically logged out and redirected to login page

**Expected Result**: Auto-logout and redirect to login page

---

#### Test 1.5: Activity Resets Timer
**Steps**:
1. Log in to the app
2. Wait 1 minute
3. Move mouse or type something
4. Check session info: `SessionManager.getInfo()`
5. `timeSinceActivity` should reset to 0 or very low

**Expected Result**: Activity resets the inactivity timer

---

### 2. Password Policy Testing

#### Test 2.1: Password Strength Requirements
**Steps**:
1. Go to `registration.html`
2. Start typing a password in the password field
3. Try these passwords and observe the validation:

**Test Cases**:
- `password` → Should show "Password is too common"
- `12345678` → Should show "Missing uppercase, lowercase, special char"
- `Password` → Should show "Missing number, special char"
- `Password1` → Should show "Missing special char"
- `Password1!` → Should show "Strong" or "Very Strong" ✅

**Expected Result**: Real-time validation shows errors for weak passwords

---

#### Test 2.2: Password Strength Indicator
**Steps**:
1. Go to `registration.html`
2. Type password: `Password1!`
3. Observe the strength indicator below the password field
4. Should show a colored bar (green for strong) and "Strong" or "Very Strong" text

**Expected Result**: Visual strength indicator appears and updates in real-time

---

#### Test 2.3: Password Match Validation
**Steps**:
1. Go to `registration.html`
2. Enter password: `Password1!`
3. Enter confirm password: `Password2!`
4. Should see error: "Passwords do not match"
5. Change confirm password to: `Password1!`
6. Should see green checkmark: "Passwords match"

**Expected Result**: Real-time password match validation

---

#### Test 2.4: Form Submission with Weak Password
**Steps**:
1. Go to `registration.html`
2. Fill all required fields
3. Enter weak password: `password`
4. Click "Create Professional Account"
5. Should see error message listing all password requirements

**Expected Result**: Form does not submit, shows validation errors

---

#### Test 2.5: Form Submission with Strong Password
**Steps**:
1. Go to `registration.html`
2. Fill all required fields
3. Enter strong password: `MySecurePass123!`
4. Confirm password: `MySecurePass123!`
5. Click "Create Professional Account"
6. Should proceed with registration

**Expected Result**: Form submits successfully

---

### 3. Account Lockout Testing

#### Test 3.1: Failed Login Attempts Tracking
**Steps**:
1. Go to `login.html`
2. Enter a valid email but wrong password
3. Click "Sign In"
4. Repeat 4 more times (total 5 failed attempts)
5. On the 5th attempt, you should see a lockout message

**Expected Result**: After 5 failed attempts, account is locked

---

#### Test 3.2: Account Lockout Message
**Steps**:
1. After 5 failed login attempts (from Test 3.1)
2. Try to login again
3. Should see message: "Account is locked due to too many failed login attempts. Please try again in X minute(s)."

**Expected Result**: Clear lockout message with remaining time

---

#### Test 3.3: Lockout Duration
**Steps**:
1. Get account locked (from Test 3.1)
2. Note the lockout message showing remaining time (should be 15 minutes)
3. Wait for the lockout to expire (or check Firestore `account_lockouts` collection)
4. After 15 minutes, try logging in with correct password
5. Should be able to login

**Expected Result**: Lockout expires after 15 minutes

---

#### Test 3.4: Successful Login Clears Lockout
**Steps**:
1. Get account locked (from Test 3.1)
2. Wait a few minutes (don't wait full 15 minutes)
3. Try logging in with CORRECT password
4. If lockout hasn't expired, should still be locked
5. Wait for lockout to expire, then login with correct password
6. Should successfully login
7. Failed attempts counter should be reset

**Expected Result**: Successful login clears failed attempts counter

---

#### Test 3.5: Exponential Backoff (Advanced)
**Steps**:
1. Get account locked (5 failed attempts)
2. Wait for lockout to expire
3. Get locked again (5 more failed attempts)
4. Check lockout duration - should be 30 minutes (double the first lockout)
5. Get locked a third time - should be 60 minutes

**Expected Result**: Each subsequent lockout doubles the duration

---

### 4. Audit Logging Testing

#### Test 4.1: Login Audit Log
**Steps**:
1. Log in to the app
2. Go to Firebase Console → Firestore Database
3. Navigate to `audit_logs` collection
4. Find the most recent log entry
5. Should see:
   - `action: "login"`
   - `userId`: Your user ID
   - `userEmail`: Your email
   - `timestamp`: Current timestamp
   - `clientIP`: Your IP address
   - `userAgent`: Your browser info

**Expected Result**: Login event logged with all metadata

---

#### Test 4.2: Logout Audit Log
**Steps**:
1. Log in to the app
2. Log out (click logout button)
3. Go to Firebase Console → Firestore Database
4. Navigate to `audit_logs` collection
5. Find the most recent log entry
6. Should see:
   - `action: "logout"`
   - `userId`: Your user ID
   - `timestamp`: Logout timestamp

**Expected Result**: Logout event logged

---

#### Test 4.3: Failed Login Audit Log
**Steps**:
1. Go to `login.html`
2. Enter wrong password
3. Click "Sign In"
4. Go to Firebase Console → Firestore Database
5. Navigate to `audit_logs` collection
6. Find the most recent log entry
7. Should see:
   - `action: "login_failed"`
   - `userEmail`: Email used (or "unknown" if user not found)
   - `details`: "Login attempt failed"

**Expected Result**: Failed login attempt logged

---

#### Test 4.4: Account Lockout Audit Log
**Steps**:
1. Get account locked (5 failed attempts)
2. Go to Firebase Console → Firestore Database
3. Navigate to `audit_logs` collection
4. Find log entry with `action: "account_locked"`
5. Should see:
   - `action: "account_locked"`
   - `details`: "Account locked after 5 failed login attempts"
   - `metadata.attempts`: 5
   - `metadata.lockoutDuration`: 900000 (15 minutes in ms)

**Expected Result**: Account lockout event logged with details

---

#### Test 4.5: Registration Audit Log
**Steps**:
1. Register a new account
2. Go to Firebase Console → Firestore Database
3. Navigate to `audit_logs` collection
4. Find log entry with `action: "patient_created"` (or check for user creation)
5. Should see registration event logged

**Expected Result**: User registration logged

---

### 5. Password History Testing

#### Test 5.1: Password Saved to History
**Steps**:
1. Register a new account with password: `MyPass123!`
2. Go to Firebase Console → Firestore Database
3. Navigate to `password_history` collection
4. Find document with your user ID
5. Should see:
   - `passwords`: Array with your password (hashed in production)
   - `updatedAt`: Timestamp

**Expected Result**: Password saved to history

---

#### Test 5.2: Password Reuse Prevention
**Steps**:
1. Change your password in settings
2. Try to change it back to the same password
3. System should check password history
4. If password was used recently (within last 5), should prevent reuse

**Note**: This feature is implemented but may need additional testing when password change functionality is fully integrated.

**Expected Result**: Cannot reuse recent passwords

---

### 6. Integration Testing

#### Test 6.1: Complete Login Flow
**Steps**:
1. Go to `login.html`
2. Enter correct credentials
3. Click "Sign In"
4. Should:
   - ✅ Check account lockout (if locked, show message)
   - ✅ Attempt login
   - ✅ On success: Clear failed attempts, log audit event, start session tracking
   - ✅ Redirect to app or consent page

**Expected Result**: All security features work together seamlessly

---

#### Test 6.2: Complete Registration Flow
**Steps**:
1. Go to `registration.html`
2. Fill all fields
3. Enter strong password: `MySecurePass123!`
4. Confirm password
5. Click "Create Professional Account"
6. Should:
   - ✅ Validate password strength
   - ✅ Check password match
   - ✅ Create account
   - ✅ Save password to history
   - ✅ Log audit event

**Expected Result**: Registration with all security checks

---

## 🔍 Manual Testing Checklist

### Quick Test (5 minutes)
- [ ] Login with correct password → Should work
- [ ] Login with wrong password 5 times → Should lock account
- [ ] Try to register with weak password → Should show errors
- [ ] Try to register with strong password → Should work
- [ ] Check audit logs in Firestore → Should see login/registration events

### Comprehensive Test (30 minutes)
- [ ] All Session Management tests (1.1 - 1.5)
- [ ] All Password Policy tests (2.1 - 2.5)
- [ ] All Account Lockout tests (3.1 - 3.5)
- [ ] All Audit Logging tests (4.1 - 4.5)
- [ ] Integration tests (6.1 - 6.2)

---

## 🐛 Troubleshooting

### Issue: Session timeout not working
**Solution**:
1. Check browser console for errors
2. Verify `js/session-manager.js` is loaded: `typeof SessionManager`
3. Check if session tracking started: `SessionManager.getInfo()`

### Issue: Password validation not showing
**Solution**:
1. Check browser console for errors
2. Verify `js/password-policy.js` is loaded: `typeof PasswordPolicy`
3. Check if password input has `oninput="validatePasswordInput()"`

### Issue: Account lockout not working
**Solution**:
1. Check Firestore rules are deployed
2. Check `account_lockouts` collection in Firestore
3. Verify `js/password-policy.js` is loaded

### Issue: Audit logs not appearing
**Solution**:
1. Check Firestore rules are deployed
2. Check browser console for errors
3. Verify `js/audit-logger.js` is loaded: `typeof AuditLogger`
4. Check `audit_logs` collection in Firestore

### Issue: Firestore rules deployment failed
**Solution**:
1. Check Firebase CLI is installed: `firebase --version`
2. Check you're logged in: `firebase login`
3. Check you're in the correct project: `firebase projects:list`
4. Try deploying again: `firebase deploy --only firestore:rules`

---

## 📊 Testing Results Template

```
Date: ___________
Tester: ___________

Session Management:
[ ] Test 1.1: Activity Tracking - PASS / FAIL
[ ] Test 1.2: Inactivity Warning - PASS / FAIL
[ ] Test 1.3: Session Extension - PASS / FAIL
[ ] Test 1.4: Auto-Logout - PASS / FAIL
[ ] Test 1.5: Activity Resets Timer - PASS / FAIL

Password Policy:
[ ] Test 2.1: Strength Requirements - PASS / FAIL
[ ] Test 2.2: Strength Indicator - PASS / FAIL
[ ] Test 2.3: Password Match - PASS / FAIL
[ ] Test 2.4: Weak Password Rejection - PASS / FAIL
[ ] Test 2.5: Strong Password Acceptance - PASS / FAIL

Account Lockout:
[ ] Test 3.1: Failed Attempts Tracking - PASS / FAIL
[ ] Test 3.2: Lockout Message - PASS / FAIL
[ ] Test 3.3: Lockout Duration - PASS / FAIL
[ ] Test 3.4: Successful Login Clears - PASS / FAIL
[ ] Test 3.5: Exponential Backoff - PASS / FAIL

Audit Logging:
[ ] Test 4.1: Login Log - PASS / FAIL
[ ] Test 4.2: Logout Log - PASS / FAIL
[ ] Test 4.3: Failed Login Log - PASS / FAIL
[ ] Test 4.4: Lockout Log - PASS / FAIL
[ ] Test 4.5: Registration Log - PASS / FAIL

Integration:
[ ] Test 6.1: Complete Login Flow - PASS / FAIL
[ ] Test 6.2: Complete Registration Flow - PASS / FAIL

Issues Found:
1. ________________________________
2. ________________________________
3. ________________________________
```

---

## 🚀 Quick Start Testing

**Fastest way to test everything:**

1. **Deploy Firestore Rules** (2 minutes):
   ```bash
   firebase deploy --only firestore:rules
   ```

2. **Test Login & Lockout** (3 minutes):
   - Try wrong password 5 times → Should lock
   - Wait 15 minutes or check Firestore → Should unlock
   - Login with correct password → Should work

3. **Test Registration** (2 minutes):
   - Try weak password → Should show errors
   - Try strong password → Should work
   - Check audit logs → Should see registration event

4. **Test Session** (2 minutes):
   - Login
   - Wait 25 minutes (or change timeout in console)
   - Should see warning
   - Click to extend → Should continue

**Total: ~10 minutes for basic testing**

---

**Last Updated**: [Current Date]  
**Status**: Ready for Testing

