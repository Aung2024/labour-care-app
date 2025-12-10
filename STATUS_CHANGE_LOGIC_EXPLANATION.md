# Patient Status Change Logic Explanation

## Overview
The patient status system tracks where a patient is in their care journey. Status changes are managed by `StatusManager` in `js/status-manager.js`.

---

## Status Flow

### 1. **Registered** (Initial Status)
- **When**: Patient is first registered in the system
- **Status Value**: `'registered'`
- **Next Possible Statuses**: 
  - → `'antenatal_care'` (when first ANC visit is recorded)
  - → `'anc_transfer'` (if transferred during ANC)

---

### 2. **Antenatal Care** (`antenatal_care`)
- **When**: First ANC visit is saved
- **Trigger**: `StatusManager.checkAndUpdateToAntenatalCare(patientId)`
- **Called From**: `antenatal-form.html` when saving first visit
- **Logic**: 
  - Only updates if current status is `'registered'`
  - If already in another status, no change
- **Next Possible Statuses**:
  - → `'in_labour'` (when active first stage time is recorded)
  - → `'anc_transfer'` (if transferred during ANC)

---

### 3. **In Labour** (`in_labour`)
- **When**: Active first stage start time is recorded
- **Trigger**: `StatusManager.checkAndUpdateToInLabour(patientId)`
- **Called From**: 
  - `labour-care-setup.html` (when setting up labour care)
  - `summary.html` (when confirming start time)
  - `labour-care-entry.html` (when saving starting time)
- **Logic**:
  - Only updates if current status is `'registered'` or `'antenatal_care'`
  - If already transferred or in labour, no change
- **Next Possible Statuses**:
  - → `'birthed'` (when second stage time is recorded OR immediate/newborn care is saved)
  - → `'labour_transfer'` (if transferred during labour)

---

### 4. **Birthed** (`birthed`)
- **When**: 
  - Second stage time is recorded, OR
  - Immediate/newborn care data is saved
- **Trigger**: `StatusManager.checkAndUpdateToBirthed(patientId, reason)`
- **Called From**:
  - `summary.html` (when second stage time is confirmed)
  - `labour-care-entry.html` (when second stage time is saved)
  - `immediate-newborn-care.html` (when care data is saved)
- **Logic**:
  - Only updates if current status is `'in_labour'`
  - If already transferred or birthed, no change
- **Next Possible Statuses**:
  - → `'postnatal_care'` (when PNC visit is recorded)

---

### 5. **Postnatal Care** (`postnatal_care`)
- **When**: Any postnatal visit is recorded
- **Trigger**: `StatusManager.checkAndUpdateToPostnatalCare(patientId, reason)`
- **Called From**: `postpartum-form.html` when saving PNC visit
- **Logic**:
  - Updates if current status is NOT already `'postnatal_care'`
  - Can update from `'birthed'` or other statuses
- **Next Possible Statuses**:
  - → `'pnc_transfer'` (if transferred during PNC)

---

## Transfer Statuses

### 6. **ANC Transfer** (`anc_transfer`)
- **When**: Transfer button is clicked from ANC form
- **Trigger**: `StatusManager.checkAndUpdateToTransfer(patientId, 'anc_transfer', reason)`
- **Called From**: `transfer.html` when `type=anc` parameter is present
- **Logic**:
  - Updates patient status to `'anc_transfer'`
  - Can be called from any status (no restrictions)
- **Final Status**: This is typically an end state (patient transferred out)

---

### 7. **Labour Transfer** (`labour_transfer`)
- **When**: Transfer button is clicked from labour care views
- **Trigger**: `StatusManager.checkAndUpdateToTransfer(patientId, 'labour_transfer', reason)`
- **Called From**: 
  - `transfer.html` when `type=labour` parameter is present
  - **NEW**: `summary.html` and `labour-care-entry.html` (transfer button)
- **Logic**:
  - Updates patient status to `'labour_transfer'`
  - Can be called from any status (no restrictions)
- **Final Status**: This is typically an end state (patient transferred out)

---

### 8. **PNC Transfer** (`pnc_transfer`)
- **When**: Transfer button is clicked from PNC form
- **Trigger**: `StatusManager.checkAndUpdateToTransfer(patientId, 'pnc_transfer', reason)`
- **Called From**: `transfer.html` when `type=pnc` parameter is present
- **Logic**:
  - Updates patient status to `'pnc_transfer'`
  - Can be called from any status (no restrictions)
- **Final Status**: This is typically an end state (patient transferred out)

---

## Key Functions in StatusManager

### `updatePatientStatus(patientId, newStatus, reason)`
- **Purpose**: Core function that updates patient status in Firestore
- **Updates**:
  - `status`: New status value
  - `status_updated_at`: Server timestamp
  - `status_update_reason`: Reason for change

### `checkAndUpdateToAntenatalCare(patientId)`
- **Condition**: Only if status is `'registered'`
- **New Status**: `'antenatal_care'`

### `checkAndUpdateToInLabour(patientId)`
- **Condition**: Only if status is `'registered'` or `'antenatal_care'`
- **New Status**: `'in_labour'`

### `checkAndUpdateToBirthed(patientId, reason)`
- **Condition**: Only if status is `'in_labour'`
- **New Status**: `'birthed'`

### `checkAndUpdateToPostnatalCare(patientId, reason)`
- **Condition**: If status is NOT already `'postnatal_care'`
- **New Status**: `'postnatal_care'`

### `checkAndUpdateToTransfer(patientId, transferType, reason)`
- **Transfer Types**: `'anc_transfer'`, `'labour_transfer'`, `'pnc_transfer'`
- **Condition**: No restrictions (can transfer from any status)
- **New Status**: The specified transfer type

---

## Status Change Rules Summary

| Current Status | Can Change To | Condition |
|---------------|---------------|-----------|
| `registered` | `antenatal_care` | First ANC visit saved |
| `registered` | `anc_transfer` | Transfer button clicked (ANC) |
| `registered` | `labour_transfer` | Transfer button clicked (Labour) |
| `antenatal_care` | `in_labour` | Active first stage time recorded |
| `antenatal_care` | `anc_transfer` | Transfer button clicked (ANC) |
| `in_labour` | `birthed` | Second stage time OR newborn care saved |
| `in_labour` | `labour_transfer` | Transfer button clicked (Labour) |
| `birthed` | `postnatal_care` | PNC visit saved |
| `postnatal_care` | `pnc_transfer` | Transfer button clicked (PNC) |
| **Any status** | **Any transfer** | Transfer button clicked (no restrictions) |

---

## Important Notes

1. **Transfer Statuses are Final**: Once a patient is transferred, they typically don't return to active care in the same system.

2. **Status Checks are Defensive**: Functions check current status before updating to prevent overwriting important states (e.g., won't change from `'labour_transfer'` back to `'in_labour'`).

3. **Transfer Can Happen Anytime**: Transfer buttons can be clicked from any care view, and the status will update accordingly based on the transfer type.

4. **Status Update Reasons**: All status changes include a reason for logging/audit purposes.

5. **Server Timestamps**: All status updates use `firebase.firestore.FieldValue.serverTimestamp()` for accurate timing.

---

## Implementation for Labour Transfer Button

When adding the transfer button to `summary.html` and `labour-care-entry.html`:

1. **Button Design**: Yellow button (`btn-warning`), same as ANC/PNC pages
2. **Function**: `referPatient()` that redirects to `transfer.html?patient={id}&type=labour`
3. **Status Update**: Happens in `transfer.html` when form is saved
4. **Status Value**: `'labour_transfer'` (defined in `StatusManager.STATUSES.LABOUR_TRANSFER`)

---

**Last Updated**: [Current Date]  
**Status Manager Version**: Current

