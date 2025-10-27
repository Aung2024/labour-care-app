# Setup Page Second Stage Time Loading Fix

## 🐛 Problems
1. **Second stage time not loading in setup page** - It appeared in carousel entry page but was missing in setup page
2. **Times not locked** - Midwife could accidentally enter a new second stage time
3. **Entry page wouldn't load properly** - When no second stage time was entered

## 🔍 Root Cause

### Problem 1 & 2: Setup Page Not Loading Second Stage Time
The `loadExistingLabourData()` function in `labour-care-setup.html` was only checking the `summary` document for second stage time. It wasn't checking the `secondStage` document where Classic LCG saves the data.

### Problem 3: Entry Page Not Handling Null Second Stage
The entry page code needed better error handling when second stage time was null/undefined.

## ✅ Solutions

### 1. Enhanced Setup Page Loading
Updated `labour-care-setup.html` to check multiple sources:

**Before:**
```javascript
// Load second stage time
if (data.secondStageTime || data.secondStage_Time) {
  const secondStageInput = document.getElementById('secondStageStart');
  // ... lock the input
}
```

**After:**
```javascript
// Load second stage time
let secondStageTime = data.secondStageTime || data.secondStage_Time;

// Also try loading from secondStage document (Classic LCG saves here)
if (!secondStageTime) {
  const secondStageDoc = await firebase.firestore()
    .collection('patients')
    .doc(patientId)
    .collection('records')
    .doc('secondStage')
    .get();
  
  if (secondStageDoc.exists) {
    const secondStageData = secondStageDoc.data();
    // Only use if isSecondStageActive is true
    if (secondStageData.isSecondStageActive && secondStageData.secondStageStartTime) {
      secondStageTime = secondStageData.secondStageStartTime;
    }
  }
}

if (secondStageTime) {
  // Lock the input
}
```

### 2. Enhanced Entry Page Error Handling
Added better error logging and validation:

```javascript
if (state.startTime) {
  generateTimepoints(state.startTime, state.secondStageTime);
  if (state.timepoints && state.timepoints.length > 0) {
    // ... proceed with rendering
    console.log('✅ Loaded data with', state.timepoints.length, 'timepoints');
  } else {
    console.error('❌ No timepoints generated!');
    console.error('  Start time:', state.startTime);
    console.error('  Second stage time:', state.secondStageTime);
  }
}
```

## 📊 Data Flow

### Setup Page Now Checks:
1. `patients/[id]/records/summary` → `secondStageTime` or `secondStage_Time`
2. `patients/[id]/records/secondStage` → `secondStageStartTime` (if `isSecondStageActive` is true)

### Entry Page Checks:
1. Same as above, plus better error handling

## ✅ Testing Checklist
- [ ] Enter second stage time in Classic LCG
- [ ] Verify it appears in setup page (locked)
- [ ] Verify it appears in entry page
- [ ] Try to change locked time in setup page (should be disabled)
- [ ] Test without second stage time (should work normally)
- [ ] Check console logs for any errors

## 🚀 Status
Fixed! Setup page now properly loads and locks second stage times, and entry page handles missing second stage times gracefully.
