# Labour Care Entry - 1-Hour Interval Fix

## 🐛 Problem
The Labour Care Entry page was only generating 30-minute timepoints (for FHR/Contractions), but NOT generating 1-hour timepoints for other sections like Support, Woman, Baby, Meds, SDM, Descent Plot.

This meant:
- Midwives could only see FHR and Contractions fields
- Other fields (Support, Woman, Baby, etc.) were never accessible
- Data entry was incomplete

## ✅ Solution
Updated `generateTimepoints()` to generate BOTH interval types:

### 30-Minute Intervals (First Stage)
- ✅ Generated for FHR and Contractions monitoring
- Marked with `interval: '30min'`
- Example: 08:00, 08:30, 09:00, 09:30...

### 1-Hour Intervals (First Stage)  
- ✅ Generated for Support, Woman, Baby, Meds, SDM, Descent Plot
- Marked with `interval: '60min'`
- Example: 08:00, 09:00, 10:00, 11:00...
- Deduplication: skips times that already exist as 30-min intervals

### 15-Minute Intervals (Second Stage)
- ✅ Generated for FHR, Contractions, and Cervix Plot
- Marked with `interval: '15min'`
- Example: 15:30, 15:45, 16:00, 16:15...

## 🔧 Technical Changes

### 1. Updated `generateTimepoints()` Function
```javascript
// Generate 30-minute intervals
result.push({ time: timeStr, isSecondStage: false, interval: '30min' });

// Generate 1-hour intervals (skip duplicates)
if (!alreadyExists) {
  result.push({ time: timeStr, isSecondStage: false, interval: '60min' });
}

// Generate 15-minute intervals (second stage)
result.push({ time: timeStr, isSecondStage: true, interval: '15min' });
```

### 2. Updated `getIntervalForTimepoint()` Function
```javascript
// Now uses the interval property directly
if (tp && tp.interval) {
  return tp.interval;
}
```

## 📊 Section Visibility Rules

### 30-min interval timepoints (first stage):
- FHR
- Contractions

### 1-hour interval timepoints (first stage):
- Support
- FHR  
- Woman
- Baby
- Contractions
- Cervix Plot
- Descent Plot
- Meds
- SDM

### 15-min interval timepoints (second stage):
- FHR
- Contractions
- Cervix Plot

## 🎯 Benefits

1. **Complete Data Entry**: Midwives can now enter all required fields
2. **Smart Filtering**: Only relevant fields show for each interval type
3. **Data Consistency**: Matches summary view time columns
4. **Better UX**: Right fields at the right time

## 🚀 Status
Fixed! All interval types now generate and display correctly.
