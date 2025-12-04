# Privacy Policy Link Placement Strategy

## 📍 **Recommended Placement Locations**

### **🔴 CRITICAL - Must Include:**

#### **1. Login Page (`login.html`)**
- **Location:** Footer (below the "MNCH App 2025" text)
- **Why:** Users see this before accessing the app - most important placement
- **Format:** Small link text: "Privacy Policy | Terms of Use"
- **Implementation:** Add to existing footer

#### **2. Registration Page (`registration.html`)**
- **Location:** 
  - Footer (same as login)
  - **AND** near the submit button with a checkbox: "I have read and agree to the Privacy Policy"
- **Why:** Users are providing personal information during registration
- **Format:** 
  - Footer link
  - Checkbox with link: "I agree to the [Privacy Policy](privacy-policy.html)"
- **Implementation:** Add checkbox before submit button, make it required

---

### **🟡 HIGH PRIORITY - Should Include:**

#### **3. Main Dashboard (`index.html`)**
- **Location:** Footer
- **Why:** Main entry point after login, users may want to review policy
- **Format:** Small link in footer: "Privacy Policy"
- **Implementation:** Add to existing footer

#### **4. Patient Care Hub (`patient-care-hub.html`)**
- **Location:** Footer
- **Why:** Central hub where users access patient data
- **Format:** Small link in footer
- **Implementation:** Add to existing footer

---

### **🟠 OPTIONAL - Nice to Have:**

#### **5. Patient Registration Form (`registration.html` - patient registration)**
- **Location:** At the top of the form, before data entry begins
- **Why:** Users are entering patient data, should be aware of privacy policy
- **Format:** Small text: "By proceeding, you agree to our [Privacy Policy](privacy-policy.html)"
- **Implementation:** Add as a notice at the top of the registration form

#### **6. Consent Screen (Future - `consent.html`)**
- **Location:** Link within the consent text
- **Why:** Users are giving consent, should be able to read full policy
- **Format:** "Please read our [Privacy Policy](privacy-policy.html) before proceeding"
- **Implementation:** Will be added when consent screen is created

---

## ❌ **NOT Recommended:**

- **Every single page** - Too cluttered, not necessary
- **Inside forms** - Distracts from data entry
- **Header navigation** - Takes up valuable space
- **Modal popups** - Annoying for users

---

## 📝 **Implementation Priority:**

1. **Phase 1 (Immediate):**
   - ✅ Login page footer
   - ✅ Registration page footer + checkbox

2. **Phase 2 (Soon):**
   - ✅ Main dashboard footer
   - ✅ Patient care hub footer

3. **Phase 3 (Later):**
   - ⏳ Patient registration form notice
   - ⏳ Consent screen (when created)

---

## 🎨 **Design Guidelines:**

### **Footer Links:**
- Small font size (0.85rem)
- Subtle color (#6b7280 or similar)
- Separated by "|" or "•"
- Example: `Privacy Policy | Terms of Use | Contact`

### **Checkbox Format:**
- Clear, readable text
- Link should open in new tab
- Required field (cannot submit without checking)
- Example: `☑ I have read and agree to the [Privacy Policy](privacy-policy.html)`

### **Notice Format:**
- Small, unobtrusive text
- Link should be clearly visible
- Example: `By using this system, you agree to our [Privacy Policy](privacy-policy.html)`

---

## 🔗 **Link Behavior:**

- **Open in same tab** for footer links (users can use browser back button)
- **Open in new tab** for checkbox/notice links (so users don't lose form data)
- **Mobile-friendly** - ensure links are easily tappable on small screens

---

## ✅ **Summary:**

**Minimum Required:**
- Login page footer
- Registration page footer + checkbox

**Recommended:**
- Add main dashboard and patient care hub footers

**Total Pages to Modify:** 4 pages (login, registration, index, patient-care-hub)

This provides good coverage without cluttering every page!

