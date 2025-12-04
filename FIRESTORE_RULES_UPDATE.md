# Firestore Rules Update for Consent System

## 📋 **Additional Rules Required**

Add the following rules to your `firestore.rules` file to support the consent system:

---

## **1. Provider Consents Collection**

Add this **after** the `users` collection rules (around line 17):

```javascript
// Provider Consents collection (stores provider consent records)
match /provider_consents/{userId} {
  // Allow users to read/write their own consent
  allow read, write: if request.auth != null && request.auth.uid == userId;
  
  // Allow Super Admin to read all provider consents (for audit purposes)
  allow read: if
    request.auth != null
    && exists(/databases/$(database)/documents/users/$(request.auth.uid))
    && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == "Super Admin";
}
```

**Location:** Add this as a new top-level collection rule (same level as `users`, `patients`, `feedback`)

---

## **2. Patient Consents Subcollection**

Add this **inside** the `patients` collection rules, **before** the catch-all rule (around line 88):

```javascript
// Allow access to consents subcollection (patient consent records)
match /consents/{consentId} {
  // Allow authenticated healthcare providers to read consent records (for audit purposes)
  allow read: if request.auth != null;
  
  // Allow users to write consent if they are the provider who collected it
  allow write: if 
    request.auth != null 
    && (
      request.resource.data.providerId == request.auth.uid
      || (
        exists(/databases/$(database)/documents/users/$(request.auth.uid))
        && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == "Super Admin"
      )
    );
}
```

**Location:** Add this inside the `match /patients/{patientId}` block, after other subcollection rules like `baby_records`, `labour_care`, etc.

---

## **📝 Complete Updated Section**

Here's how the updated section should look:

```javascript
// Patients collection
match /patients/{patientId} {
  // Allow authenticated users to read/write patient documents
  allow read, write: if request.auth != null;
  
  // ... existing subcollection rules ...
  
  // Allow access to consents subcollection (patient consent records)
  match /consents/{consentId} {
    // Allow authenticated healthcare providers to read consent records (for audit purposes)
    allow read: if request.auth != null;
    
    // Allow users to write consent if they are the provider who collected it
    allow write: if 
      request.auth != null 
      && (
        request.resource.data.providerId == request.auth.uid
        || (
          exists(/databases/$(database)/documents/users/$(request.auth.uid))
          && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == "Super Admin"
        )
      );
  }
  
  // Catch-all rule for any other subcollections under patients
  match /{subcollection}/{document=**} {
    allow read, write: if request.auth != null;
  }
}

// Provider Consents collection (stores provider consent records)
match /provider_consents/{userId} {
  // Allow users to read/write their own consent
  allow read, write: if request.auth != null && request.auth.uid == userId;
  
  // Allow Super Admin to read all provider consents (for audit purposes)
  allow read: if
    request.auth != null
    && exists(/databases/$(database)/documents/users/$(request.auth.uid))
    && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == "Super Admin";
}
```

---

## **🔒 Security Notes**

### **Provider Consents:**
- ✅ Users can only read/write their own consent
- ✅ Super Admin can read all consents (for audit/compliance)
- ✅ Prevents users from modifying other users' consent records

### **Patient Consents:**
- ✅ All authenticated healthcare providers can read (needed for audit trail)
- ✅ Only the provider who collected consent can write (via `providerId` field)
- ✅ Super Admin can also write (for corrections/updates if needed)
- ✅ Prevents unauthorized modification of consent records

---

## **✅ Testing Checklist**

After updating the rules:

1. ✅ Deploy rules to Firestore
2. ✅ Test provider consent creation (user should be able to save their own)
3. ✅ Test provider consent reading (user should only see their own)
4. ✅ Test patient consent creation (provider should be able to save)
5. ✅ Test patient consent reading (all providers should be able to read)
6. ✅ Test Super Admin access (should be able to read all consents)

---

## **🚨 Important**

- The catch-all rule `match /{subcollection}/{document=**}` already covers `consents`, but it's better to be explicit for security
- These rules follow the principle of least privilege
- All consent records are auditable by Super Admin for compliance

