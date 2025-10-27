# Alerts Drawer Implementation Fix

## 🐛 Problem
The alerts button in the labour care entry page was not working. When clicked, it opened an empty drawer with no recommendations.

## 🔍 Root Cause
The alerts drawer was missing the logic to:
1. Check for alert values across all entered data
2. Generate clinical recommendations based on WHO LCG criteria
3. Display the recommendations in the drawer

## ✅ Solution
Copied the complete recommendations logic from Classic LCG (`summary.html`) to the carousel:

### 1. Enhanced `checkAlerts()` Function
Now properly counts alerts and updates the alerts chip:
```javascript
function checkAlerts() {
  // Count alerts across all timepoints
  const alertCount = Object.keys(state.data).filter(k => {
    const [fieldKey] = k.split('_');
    return isAlertValue(fieldKey, state.data[k]);
  }).length;
  
  // Update alerts chip
  const alertsChip = document.getElementById('alertsChip');
  if (alertsChip) {
    alertsChip.textContent = alertCount > 0 ? alertCount : '⚠';
    alertsChip.style.backgroundColor = alertCount > 0 ? '#dc2626' : '#6b7280';
  }
}
```

### 2. Added `showRecommendations()` Function
Complete implementation copied from Classic LCG:
- Checks all entered data for alert values
- Uses WHO LCG alert criteria
- Generates specific clinical recommendations
- Displays recommendations in the drawer

**Alert Criteria (same as Classic LCG):**
- **FHR**: < 110 or ≥ 160 bpm
- **Pulse**: < 60 or ≥ 120 bpm  
- **Systolic BP**: < 80 or ≥ 140 mmHg
- **Diastolic BP**: ≥ 90 mmHg
- **Temperature**: < 35.0°C or ≥ 37.5°C
- **Pain Relief**: "No" selected
- **Mobility**: "Supine Position" selected
- **FHR Deceleration**: Early, Late, or Variable
- **Contractions**: < 2 or > 5 per 10 min
- **Duration**: < 20 or > 50 seconds

### 3. Updated `openAlertsDrawer()` Function
Now calls `showRecommendations()` when the drawer opens:
```javascript
function openAlertsDrawer() {
  const drawer = document.getElementById('alertsDrawer');
  const backdrop = document.querySelector('.backdrop');
  if (drawer) drawer.classList.add('open');
  if (backdrop) backdrop.classList.add('active');
  
  // Show recommendations when drawer opens
  showRecommendations();
}
```

## 📊 Clinical Recommendations
The drawer shows specific recommendations for each alert type:

- **Pain Relief/Mobility**: "Review supportive care measures. Ensure adequate pain relief, mobility, and hydration."
- **FHR/FHR Deceleration**: "Monitor fetal heart rate closely. Consider fetal assessment and continuous monitoring if pattern persists."
- **Pulse**: "Monitor maternal pulse. Check for underlying causes and consider cardiovascular assessment."
- **Blood Pressure**: "Monitor blood pressure closely. Consider antihypertensive therapy if severe hypertension."
- **Temperature**: "Monitor for signs of infection. Consider antibiotics if infection suspected."
- **Contractions**: "Monitor and document progress. Consider specialist consultation if needed."

## ✅ Features
- ✅ Alerts chip shows count of active alerts
- ✅ Chip changes color when alerts are present (red) vs none (gray)
- ✅ Drawer opens with current recommendations
- ✅ Recommendations update when data changes
- ✅ Same logic as Classic LCG for consistency
- ✅ No timepoint-specific filtering (shows all alerts)

## 🧪 Testing
1. Enter some alert values (e.g., FHR < 110, Pain Relief = No)
2. Click the alerts button (⚠)
3. Drawer should open with clinical recommendations
4. Alerts chip should show the count and be red
5. Change values and reopen drawer to see updated recommendations

## 🚀 Status
Fixed! Alerts drawer now works exactly like Classic LCG with full clinical recommendations.
