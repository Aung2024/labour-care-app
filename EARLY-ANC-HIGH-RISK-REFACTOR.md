# Early ANC & High Risk Fields Migration

## 🎯 Objective
Move "Early ANC Visit" and "High Risk Pregnancy Assessment" fields from patient registration to ANC visit form.

## ✅ Changes Made

### 1. Patient Registration (`patient-enhanced.html`)
**Removed:**
- Early ANC Visit checkbox
- High Risk Pregnancy Assessment radio buttons
- High Risk Details section (all checkboxes and notes)
- `toggleHighRiskDetails()` function
- Event listeners for high risk toggle
- Data fields from save function: `early_anc_visit`, `high_risk`, `risk_factors`, `risk_notes`

### 2. ANC Form (`antenatal-form.html`)
**Added in ANC Information section:**

1. **Early ANC Visit:**
   - Checkbox: "Patient had early ANC visit (before 14 weeks)"

2. **High Risk Pregnancy Assessment:**
   - Radio buttons: "No - Standard risk pregnancy" or "Yes - High risk pregnancy"
   - Conditional High Risk Details section:
     - 7 checkboxes for risk factors (Maternal age ≥35, Diabetes, Hypertension, Previous complications, Multiple pregnancy, Placenta issues, Other medical conditions)
     - Additional Notes textarea

**JavaScript Functions Added:**
- `toggleHighRiskDetails()` - Shows/hides risk factors section
- Event listeners for high risk radio buttons
- Save logic for `early_anc_visit`, `high_risk`, `risk_factors`, `risk_notes`
- Load logic to populate fields from existing visit data

## 📋 Field Mapping

### Early ANC Visit
- **Registration:** `early_anc_visit: data.earlyAncVisit === 'yes'`
- **ANC Form:** `early_anc_visit: document.getElementById('earlyAncVisit').checked`

### High Risk Assessment
- **Registration:** `high_risk: data.highRisk || 'no'`
- **ANC Form:** `high_risk: document.querySelector('input[name="highRisk"]:checked').value`

### Risk Factors
- **Registration:** `risk_factors: [data.riskFactors]`
- **ANC Form:** `risk_factors: Array.from(document.querySelectorAll('input[name="riskFactors"]:checked')).map(cb => cb.value)`

### Risk Notes
- **Registration:** `risk_notes: data.riskNotes || null`
- **ANC Form:** `risk_notes: document.getElementById('riskNotes').value || null`

## 🎯 Benefits

1. **More Appropriate Location:** Early ANC and High Risk data is visit-specific, not patient-registration specific
2. **Better Clinical Workflow:** Captured during actual ANC visits
3. **Consistent with Medical Practice:** Risk assessment is part of ongoing care, not initial registration
4. **All Checkboxes Preserved:** All 7 risk factor checkboxes copied exactly

## 🚀 Status
Complete! Early ANC and High Risk fields successfully moved to ANC form with all checkboxes preserved.
