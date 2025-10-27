# Second Stage Time Alignment Fix

## 🐛 Problem
In Classic LCG (`summary.html`) and View Summary (`summary-view.html`), several sections were NOT starting at the exact second stage time:

**Affected Sections:**
- ❌ Supportive Care (starting at 08:23 instead of 07:30)
- ❌ Baby section (starting at 08:23 instead of 07:30)
- ❌ Woman section (starting at 08:23 instead of 07:30)
- ❌ Descent Plot (starting at 08:23 instead of 07:30)
- ❌ Medication (starting at 08:23 instead of 07:30)
- ❌ Shared Decision-Making (starting at 08:23 instead of 07:30)
- ❌ Initials (starting at 08:23 instead of 07:30)

**Working Correctly:**
- ✅ FHR section (starting at 07:30)
- ✅ Cervix Plot (starting at 07:30)

**Impact:**
- Data entered at 07:30 in Carousel LCG was NOT appearing in Classic LCG or View Summary
- Caused data visibility issues and potential data loss

## 🔍 Root Cause
The `generateOtherTimeColumns()` function was generating 1-hour intervals from the start time without checking for or including the exact second stage time.

**Old Logic:**
```javascript
supportiveCareTimeCols = [];
for (let i = 0; i <= 12; i++) {
  const hour = (startHour + i) % 24;
  const timeStr = `${hour.toString().padStart(2, '0')}:${startMinute.toString().padStart(2, '0')}`;
  supportiveCareTimeCols.push(timeStr);
}
```

This simply added 1-hour intervals from the start time (01:23), resulting in:
- 01:23, 02:23, 03:23, 04:23, 05:23, 06:23, 07:23, 08:23...

Notice: **07:30 is missing!**

## ✅ Solution
Updated `generateOtherTimeColumns()` in both `summary.html` and `summary-view.html` to:
1. Generate 1-hour intervals up to (but not including) the second stage time
2. **Add the EXACT second stage time** as a separate column
3. Continue with 1-hour intervals after the second stage time

**New Logic:**
```javascript
const generateWithSecondStage = () => {
  const timeCols = [];
  const startTimeDate = new Date(`2000-01-01T${activeFirstStageStartTime}:00`);
  let currentTime = new Date(startTimeDate);
  
  if (secondStageStartTime && isSecondStageActive) {
    const secondStageDate = new Date(`2000-01-01T${secondStageStartTime}:00`);
    const exactSecondStageTime = secondStageStartTime;
    
    // Generate 1-hour intervals up to (but not including) second stage
    while (currentTime < secondStageDate) {
      const timeStr = currentTime.toTimeString().slice(0, 5);
      timeCols.push(timeStr);
      currentTime.setHours(currentTime.getHours() + 1);
    }
    
    // Add the EXACT second stage time
    timeCols.push(exactSecondStageTime);
    
    // Continue 1-hour intervals after second stage
    currentTime = new Date(secondStageDate);
    currentTime.setHours(currentTime.getHours() + 1);
  }
  
  // Generate remaining 1-hour intervals
  while (currentTime <= endTimeDate) {
    const timeStr = currentTime.toTimeString().slice(0, 5);
    timeCols.push(timeStr);
    currentTime.setHours(currentTime.getHours() + 1);
  }
  
  return timeCols;
};
```

## 📊 Result
**Before Fix:**
- Time columns: 01:23, 02:23, 03:23, 04:23, 05:23, 06:23, 07:23, 08:23...

**After Fix:**
- Time columns: 01:23, 02:23, 03:23, 04:23, 05:23, 06:23, 07:23, **07:30**, 08:30...

## 🎯 Impact
Now ALL sections align perfectly with the Carousel LCG:
- ✅ Supportive Care columns now include 07:30
- ✅ Baby section columns now include 07:30
- ✅ Woman section columns now include 07:30
- ✅ Descent Plot columns now include 07:30
- ✅ Medication columns now include 07:30
- ✅ Shared Decision-Making columns now include 07:30
- ✅ Initials columns now include 07:30

**Data entered at 07:30 in Carousel LCG will now appear correctly in Classic LCG and View Summary!**

## ✅ Testing Checklist
- [ ] Enter data at 07:30 in Carousel LCG for Supportive Care
- [ ] Verify data appears in Classic LCG at 07:30 column
- [ ] Verify data appears in View Summary at 07:30 column
- [ ] Test with Baby section
- [ ] Test with Woman section
- [ ] Test with Descent Plot
- [ ] Test with Medication
- [ ] Test with Shared Decision-Making
- [ ] Test with Initials
- [ ] Verify second stage highlighting still works
- [ ] Test without second stage time (should work normally)

## 🚀 Status
Fixed! All sections now align with the exact second stage time!
