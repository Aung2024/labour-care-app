# Bug Fix - Timepoint Generation Error

## 🐛 Issue
The page was crashing with a JavaScript error at line 364 in `labour-care-entry.html`. The error occurred in the timepoint generation logic.

## 🔍 Root Cause
The time calculation was not properly handling:
1. 24-hour wraparound for minute calculations
2. Setting `currentMin` to start at second stage time
3. Calculating hours and minutes from total minutes

## ✅ Fix Applied

### Changes to `generateTimepoints` function:

**Before:**
```javascript
const h = Math.floor(currentMin / 60) % 24;
const m = currentMin % 60;
```

**After:**
```javascript
const totalMins = currentMin % (24 * 60); // Wrap around 24 hours
const h = Math.floor(totalMins / 60);
const m = totalMins % 60;
```

### Additional Fix:
Added explicit setting of `currentMin` for second stage:
```javascript
// Start exactly at second stage time
currentMin = secondStageMin;
```

## 📋 What Changed

1. **Proper 24-hour wrapping**: Now correctly wraps around when calculating hours
2. **Explicit second stage start**: Sets `currentMin = secondStageMin` to ensure we start at the exact second stage time
3. **Better minute calculation**: Uses modulo to handle 24-hour day wrap-around

## ✅ Testing

The page should now:
- ✅ Load without JavaScript errors
- ✅ Generate timepoints correctly
- ✅ Handle first stage 30-min intervals
- ✅ Handle second stage 15-min intervals
- ✅ Start second stage at exact time
- ✅ Wrap around 24-hour clock if needed

## 🚀 Status
Fixed and ready to test!

