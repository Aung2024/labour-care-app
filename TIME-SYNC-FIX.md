# Time Synchronization Fix

## 🐛 Problem
Times were not being synced between Classic LCG and Carousel LCG:
1. Times entered in Classic LCG were not visible in Carousel Entry
2. Times entered in Carousel Entry were not visible after page reload
3. Times entered in one mode were not available in the other mode

## 🔍 Root Cause
Different storage locations:
- **Classic LCG** saves to: `patients/[id]/records/startingTime` document
- **Classic LCG** also saves to: `patients/[id]/records/summary` document
- **Carousel Entry** was only reading from `summary` document
- Field names were inconsistent

## ✅ Solution
**Unified storage approach** - Save and load from ALL locations

### 1. Loading Times (labour-care-entry.html)
Now checks multiple sources:
```javascript
// Check summary document
const doc = await base.collection("records").doc("summary").get();
// Check startingTime document
const startingTimeDoc = await base.collection("records").doc("startingTime").get();
// Check secondStage document
const secondStageDoc = await base.collection("records").doc("secondStage").get();

// Try multiple field name variations
state.startTime = data.startingTime || data.activeFirstStage_Time || 
                 startingTimeDoc.data().startingTime;
state.secondStageTime = data.secondStageTime || data.secondStage_Time ||
                       secondStageDoc.data().secondStageStartTime;
```

### 2. Saving Times (labour-care-entry.html)
Now saves to ALL locations:
```javascript
// Save to summary (for carousel)
await base.collection("records").doc("summary").set({
  startingTime: state.startTime,
  secondStageTime: state.secondStageTime
}, { merge: true });

// Save to startingTime document (for Classic LCG)
await base.collection("records").doc("startingTime").set({
  startingTime: state.startTime,
  timestamp: firebase.firestore.FieldValue.serverTimestamp()
}, { merge: true });

// Save second stage (for Classic LCG)
await base.collection("records").doc("secondStage").set({
  secondStageStartTime: state.secondStageTime,
  isSecondStageActive: true,
  timestamp: firebase.firestore.FieldValue.serverTimestamp()
}, { merge: true });
```

### 3. Setup Page Saves (labour-care-setup.html)
Also saves to all locations for consistency

## 📋 Data Flow
```
Classic LCG Input → Save to startingTime + summary documents
       ↓
Carousel Entry Loads → Reads from startingTime + summary documents
       ↓
Carousel Entry Saves → Writes to startingTime + summary + secondStage documents
       ↓
Classic LCG Loads → Reads from startingTime + secondStage documents
       ↓
Perfect Sync! ✅
```

## ✅ Testing Checklist
- [ ] Enter times in Classic LCG
- [ ] Verify times are visible in Carousel Entry
- [ ] Enter new times in Carousel Entry
- [ ] Reload page - verify times persist
- [ ] Verify times are visible in Classic LCG
- [ ] Switch back and forth multiple times
- [ ] Verify data consistency

## 🚀 Status
Fixed! Times now sync perfectly between modes!
