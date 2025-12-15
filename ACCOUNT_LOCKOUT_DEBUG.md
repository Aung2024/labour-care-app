# Account Lockout Debugging Guide

## 🔍 Issue: Account Lockout Not Working

### Problem
- No `account_lockouts` collection created in Firestore
- No warning message shown

### Possible Causes

1. **JavaScript files not loading**
2. **Firestore rules blocking writes**
3. **Silent errors in browser console**
4. **Email vs User ID mismatch**

---

## 🧪 Step-by-Step Debugging

### Step 1: Check if Scripts Are Loaded

Open browser console (F12) and run:

```javascript
// Check if PasswordPolicy is loaded
typeof PasswordPolicy
// Should return: "object"

// Check if AuditLogger is loaded
typeof AuditLogger
// Should return: "object"

// Check if functions exist
typeof PasswordPolicy.recordFailedAttempt
// Should return: "function"
```

**If any return "undefined"**: Scripts are not loading properly.

**Fix**: Check Network tab in browser console to see if `js/password-policy.js` and `js/audit-logger.js` are loading.

---

### Step 2: Check Browser Console for Errors

1. Open browser console (F12)
2. Try logging in with wrong password
3. Look for any red error messages

**Common errors**:
- `PasswordPolicy is not defined` → Script not loaded
- `FirebaseError: Missing or insufficient permissions` → Firestore rules issue
- `TypeError: Cannot read property...` → Code error

---

### Step 3: Test Account Lockout Manually

In browser console, try:

```javascript
// Test with your email
const testEmail = "your-email@example.com";

// Check current lockout status
PasswordPolicy.checkLockout(testEmail).then(console.log);

// Record a failed attempt
PasswordPolicy.recordFailedAttempt(testEmail).then(console.log);

// Check again
PasswordPolicy.checkLockout(testEmail).then(console.log);
```

**Expected**: Should see lockout status and attempts incrementing.

---

### Step 4: Check Firestore Rules

Your rules look correct, but verify:

1. Go to Firebase Console → Firestore → Rules
2. Check if rules are deployed (should match your local `firestore.rules`)
3. Test rules using Rules Playground in Firebase Console

**Test Rule**:
- Collection: `account_lockouts`
- Operation: `create`
- Authenticated: `true`
- Should: ✅ Allow

---

### Step 5: Check Network Requests

1. Open browser console → **Network** tab
2. Filter by "firestore"
3. Try logging in with wrong password
4. Look for Firestore requests to `account_lockouts`

**If no requests appear**: Code is not executing
**If requests show errors**: Check error details

---

## 🔧 Quick Fixes

### Fix 1: Ensure Scripts Load in Correct Order

Check `login.html` - scripts should be in this order:

```html
<script src="js/firebase.js"></script>
<script src="js/audit-logger.js"></script>
<script src="js/password-policy.js"></script>
<script src="js/session-manager.js"></script>
```

### Fix 2: Add Error Handling

Add this to `login.html` in the catch block:

```javascript
catch (err) {
  console.error('Login error:', err);
  
  // Record failed login attempt
  if (window.PasswordPolicy && (err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found')) {
    try {
      const lockoutStatus = await PasswordPolicy.recordFailedAttempt(email);
      console.log('Lockout status:', lockoutStatus);
      
      // Check if account is now locked
      if (lockoutStatus.isLocked) {
        // Show lockout message
        const currentLang = localStorage.getItem('language') || 'mm';
        const message = currentLang === 'en'
          ? `Too many failed login attempts. Account locked for ${lockoutStatus.remainingTime} minute(s).`
          : `မှားယွင်းသော ဝင်ရောက်မှု အကြိမ်ရေ များလွန်းသောကြောင့် အကောင့်ကို ${lockoutStatus.remainingTime} မိနစ် ပိတ်ထားပါသည်။`;
        
        messageDiv.innerHTML = `<div class="alert alert-warning"><i class="fas fa-lock me-2"></i>${message}</div>`;
        
        // Log account lockout
        if (window.AuditLogger) {
          await AuditLogger.logLogin(email, false);
        }
        
        isLoggingIn = false;
        return;
      }
    } catch (lockoutError) {
      console.error('Error recording failed attempt:', lockoutError);
      // Continue with normal error handling
    }
  }
  
  // ... rest of error handling
}
```

### Fix 3: Verify Firestore Connection

In browser console:

```javascript
// Check if Firestore is connected
firebase.firestore().collection('account_lockouts').doc('test').set({test: true})
  .then(() => console.log('✅ Firestore write works'))
  .catch(err => console.error('❌ Firestore write failed:', err));
```

---

## 📋 Debugging Checklist

- [ ] Scripts loading: `typeof PasswordPolicy` returns "object"
- [ ] No console errors when trying wrong password
- [ ] Firestore rules deployed correctly
- [ ] Network tab shows Firestore requests
- [ ] Manual test works: `PasswordPolicy.recordFailedAttempt(email)`
- [ ] Firestore write permission works

---

## 🎯 Most Likely Issues

1. **Scripts not loading** (check Network tab)
2. **Silent error** (check browser console)
3. **Firestore rules not deployed** (check Firebase Console)

---

## ✅ Expected Behavior

When you enter wrong password 5 times:

1. **After 1st attempt**: Normal error message
2. **After 2nd attempt**: Normal error message
3. **After 3rd attempt**: Normal error message + warning (if implemented)
4. **After 4th attempt**: Normal error message + warning
5. **After 5th attempt**: 
   - ⚠️ Lockout message: "Account locked for 15 minutes"
   - `account_lockouts` collection created in Firestore
   - Document ID = email address
   - Contains: `attempts: 5`, `lockoutUntil: timestamp`

---

**Check browser console first - that's where the answer will be!** 🔍

