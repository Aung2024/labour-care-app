# Labour Care Entry - Dynamic Field Filtering

## 🎯 Problem
The Labour Care Entry page (carousel mode) was showing all fields for all timepoints, even when the data wouldn't appear in the summary view due to time interval mismatches.

**Example:** 
- Supportive Care has 1-hour intervals in summary.html
- Carousel shows 30-minute time intervals for first stage
- Midwife fills Supportive Care data at 30-minute intervals
- Data doesn't show up in summary view (no matching time columns)

## ✅ Solution
Implemented dynamic field filtering based on timepoint intervals:

### 15-minute intervals (Second Stage):
- ✅ FHR
- ✅ Contractions  
- ✅ Cervix Plot

### 30-minute intervals (First Stage):
- ✅ FHR
- ✅ Contractions

### 60-minute intervals (Only if we add hourly timepoints):
- All sections available

## 🔧 Implementation Details

### New Functions

1. **`getIntervalForTimepoint(timepoint)`**
   - Determines if a timepoint is first stage (30-min), second stage (15-min), or hourly
   - Checks `state.timepoints` for the `isSecondStage` flag

2. **`shouldShowSection(sectionKey, interval)`**
   - Returns true/false whether a section should be shown for the current interval
   - Uses `sectionRules` mapping to determine visibility

3. **`renderSections()`** (Updated)
   - Now checks `shouldShowSection()` before rendering each section
   - Only shows relevant fields based on interval

### Section Rules Mapping

```javascript
const sectionRules = {
  '15min': ['fhr', 'contractions', 'cervix'],
  '30min': ['fhr', 'contractions'],
  '60min': ['support', 'fhr', 'woman', 'baby', 'contractions', 'cervix', 'descent', 'meds', 'sdm']
};
```

## 📊 Benefits

1. **Better UX for Midwives**: Only see relevant fields for each timepoint
2. **Data Consistency**: Data entered in carousel will appear in summary view
3. **Reduced Confusion**: No more wondering why data doesn't show up
4. **Faster Entry**: Fewer fields to fill = quicker documentation

## 🚀 Status
Implemented! Sections now dynamically show/hide based on timepoint intervals.
