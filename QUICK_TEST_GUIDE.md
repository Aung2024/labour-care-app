# Quick Testing Guide - Security Features

## 🎯 Quick Start Testing (10 minutes)

### Step 1: Open Your Preview URL

1. Go to Netlify Dashboard → Your Site → **Deploys** tab
2. Find the deploy for `security-features` branch
3. Click on it to get the preview URL
4. Open the URL in your browser

**Example URL**: `https://security-features--your-site-name.netlify.app`

---

## 🧪 Test 1: Password Policy (2 minutes)

### Test Strong Password Requirements

1. **Go to Registration Page**:
   - Navigate to: `your-preview-url.netlify.app/registration.html`

2. **Fill in the form** (name, email, phone, region, township, facility, role)

3. **Test Weak Password**:
   - Enter password: `password`
   - **Expected**: You should see:
     - ❌ Red error messages listing requirements
     - ❌ "Password is too common"
     - ❌ "Missing uppercase, lowercase, number, special char"
   - **Try to submit**: Should NOT allow submission

4. **Test Strong Password**:
   - Enter password: `MySecurePass123!`
   - **Expected**: You should see:
     - ✅ Green "Strong" or "Very Strong" indicator
     - ✅ No error messages
   - **Confirm password**: `MySecurePass123!`
   - **Expected**: ✅ "Passwords match" message
   - **Submit**: Should work ✅

**✅ Pass Criteria**: Weak passwords rejected, strong passwords accepted

---

## 🧪 Test 2: Account Lockout (3 minutes)

### Test Failed Login Attempts

1. **Go to Login Page**:
   - Navigate to: `your-preview-url.netlify.app/login.html`

2. **Try Wrong Password 5 Times**:
   - Enter a valid email (one that exists in your system)
   - Enter wrong password: `wrongpass123`
   - Click "Sign In"
   - Repeat 4 more times (total 5 attempts)

3. **On 5th Attempt**:
   - **Expected**: You should see:
     - ⚠️ Warning message: "Account is locked due to too many failed login attempts"
     - ⚠️ "Please try again in 15 minute(s)"

4. **Try to Login Again** (6th attempt):
   - **Expected**: Should still show lockout message

5. **Check Firestore** (optional):
   - Go to Firebase Console → Firestore
   - Check `account_lockouts` collection
   - Should see a document with your email/user ID
   - Should show `lockoutUntil` timestamp

**✅ Pass Criteria**: Account locks after 5 failed attempts

---

## 🧪 Test 3: Session Timeout (5 minutes)

### Test Auto-Logout on Inactivity

**Note**: Default timeout is 30 minutes. For testing, we'll temporarily change it.

1. **Login to the App**:
   - Use correct credentials
   - You should be logged in and see the dashboard

2. **Open Browser Console** (F12 or Right-click → Inspect → Console)

3. **Change Timeout for Testing**:
   ```javascript
   // Change to 2 minutes for quick testing
   SessionManager.CONFIG.INACTIVITY_TIMEOUT = 2 * 60 * 1000; // 2 minutes
   SessionManager.CONFIG.WARNING_TIME = 1 * 60 * 1000; // 1 minute warning
   
   // Restart session tracking
   SessionManager.start();
   ```

4. **Wait 1 Minute** (without moving mouse or typing):
   - **Expected**: After 1 minute, you should see:
     - ⚠️ Yellow warning banner at top: "Your session will expire in 1 minute"
     - ⚠️ "Click anywhere to stay logged in" button

5. **Test Session Extension**:
   - Click "Stay Logged In" button OR click anywhere on page
   - **Expected**: Warning disappears, session continues

6. **Test Auto-Logout**:
   - Wait another 1 minute (total 2 minutes of inactivity)
   - **Expected**: 
     - ⚠️ Alert: "Your session has expired due to inactivity"
     - 🔄 Automatic redirect to login page

**✅ Pass Criteria**: Warning appears, session extends on activity, auto-logout works

---

## 🧪 Test 4: Audit Logging (2 minutes)

### Test Login/Logout Logging

1. **Login to the App**:
   - Use correct credentials
   - Login successfully

2. **Check Firestore Audit Logs**:
   - Go to Firebase Console → Firestore Database
   - Navigate to `audit_logs` collection
   - Find the most recent log entry

3. **Verify Login Log**:
   - **Expected**: Should see:
     - `action: "login"`
     - `userId`: Your user ID
     - `userEmail`: Your email
     - `timestamp`: Current timestamp
     - `clientIP`: Your IP address
     - `userAgent`: Browser information

4. **Logout**:
   - Click logout button

5. **Check Audit Logs Again**:
   - **Expected**: Should see new log entry:
     - `action: "logout"`
     - `userId`: Your user ID
     - `timestamp`: Logout timestamp

**✅ Pass Criteria**: Login and logout events are logged with all metadata

---

## 🧪 Test 5: Failed Login Logging (1 minute)

### Test Failed Login Attempt Logging

1. **Try Wrong Password**:
   - Go to login page
   - Enter valid email but wrong password
   - Click "Sign In"

2. **Check Audit Logs**:
   - Go to Firebase Console → Firestore
   - Check `audit_logs` collection
   - Find most recent entry

3. **Verify Failed Login Log**:
   - **Expected**: Should see:
     - `action: "login_failed"`
     - `userEmail`: Email used (or "unknown")
     - `details`: "Login attempt failed"
     - `timestamp`: Current timestamp

**✅ Pass Criteria**: Failed login attempts are logged

---

## 📋 Complete Testing Checklist

### Password Policy
- [ ] Weak password rejected (`password`)
- [ ] Password requirements shown (uppercase, lowercase, number, special char)
- [ ] Password strength indicator works (shows "Weak", "Medium", "Strong")
- [ ] Strong password accepted (`MySecurePass123!`)
- [ ] Password match validation works

### Account Lockout
- [ ] 5 failed attempts lock account
- [ ] Lockout message displayed
- [ ] Lockout duration shown (15 minutes)
- [ ] Cannot login while locked
- [ ] Lockout clears after duration (or on successful login)

### Session Management
- [ ] Session tracking active (check: `SessionManager.getInfo()`)
- [ ] Warning appears before timeout (5 minutes before)
- [ ] Session extends on activity
- [ ] Auto-logout after 30 minutes inactivity
- [ ] Redirects to login page on timeout

### Audit Logging
- [ ] Login events logged
- [ ] Logout events logged
- [ ] Failed login events logged
- [ ] Account lockout events logged
- [ ] All logs include: userId, timestamp, IP, userAgent

---

## 🔍 Browser Console Commands

Open browser console (F12) and try these commands:

```javascript
// Check Session Manager
SessionManager.getInfo()
// Should show: isActive, sessionDuration, timeUntilTimeout

// Check Password Policy
PasswordPolicy.validate("test123")
// Should show: isValid: false, errors: [...]

PasswordPolicy.validate("MyPass123!")
// Should show: isValid: true, strength: "strong"

// Check Audit Logger
typeof AuditLogger
// Should return: "object"

// Check Account Lockout
PasswordPolicy.checkLockout("your-email@example.com")
// Should show: isLocked, unlockTime, attempts
```

---

## 🐛 Troubleshooting

### Issue: Password validation not showing
**Fix**: 
- Check browser console for errors
- Verify `js/password-policy.js` is loaded
- Check network tab to ensure file loaded

### Issue: Session timeout not working
**Fix**:
- Check console: `SessionManager.getInfo()`
- Verify `js/session-manager.js` is loaded
- Check for JavaScript errors in console

### Issue: Audit logs not appearing
**Fix**:
- Check Firestore rules are deployed
- Check browser console for errors
- Verify `js/audit-logger.js` is loaded
- Check network tab for Firestore requests

### Issue: Account lockout not working
**Fix**:
- Check Firestore `account_lockouts` collection
- Verify Firestore rules are deployed
- Check browser console for errors

---

## 📊 Testing Results Template

```
Date: ___________
Tester: ___________
Preview URL: ___________

Password Policy: ✅ PASS / ❌ FAIL
- Weak password rejected: ✅ / ❌
- Strong password accepted: ✅ / ❌
- Strength indicator: ✅ / ❌

Account Lockout: ✅ PASS / ❌ FAIL
- 5 attempts lock account: ✅ / ❌
- Lockout message shown: ✅ / ❌

Session Management: ✅ PASS / ❌ FAIL
- Warning appears: ✅ / ❌
- Auto-logout works: ✅ / ❌

Audit Logging: ✅ PASS / ❌ FAIL
- Login logged: ✅ / ❌
- Logout logged: ✅ / ❌
- Failed login logged: ✅ / ❌

Issues Found:
1. ________________________________
2. ________________________________
```

---

## 🎯 Priority Testing Order

1. **Password Policy** (2 min) - Easiest, visual feedback
2. **Account Lockout** (3 min) - Quick to test
3. **Audit Logging** (2 min) - Verify in Firestore
4. **Session Timeout** (5 min) - Requires waiting

**Total Time**: ~12 minutes for complete testing

---

## ✅ Success Criteria

All features work if:
- ✅ Weak passwords are rejected with clear error messages
- ✅ Strong passwords are accepted with strength indicator
- ✅ Account locks after 5 failed login attempts
- ✅ Session warning appears before timeout
- ✅ Auto-logout works after inactivity
- ✅ All critical events are logged in Firestore

---

**Ready to test? Start with Test 1 (Password Policy) - it's the quickest!** 🚀

