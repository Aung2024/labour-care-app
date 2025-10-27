# Fix: Second Stage Time Pills Not Showing

## 🐛 Bug
When fixing the `checkAlerts()` function to show correct alert numbers, I accidentally introduced a bug in the second stage pills rendering.

## ❌ The Bug
In `renderTimePills()` function at line 1311:

```javascript
// BEFORE (BROKEN):
const isSecondStage = tp.isSecondStage || tp.interval === '15min' || false;
```

The `|| false` at the end makes the entire expression ALWAYS evaluate to `false`, regardless of whether `tp.isSecondStage` or `tp.interval === '15min'` are true.

## ✅ The Fix
Changed to:

```javascript
// AFTER (FIXED):
const isSecondStage = tp.isSecondStage || (tp.interval === '15min');
```

Now the logic correctly checks:
1. If `tp.isSecondStage` is true
2. OR if `tp.interval === '15min'`

This ensures second stage pills are properly identified and styled with the green background.

## 🎯 What This Fixes
- Second stage time pills now display correctly with green background
- Pills starting from the exact second stage time show as "second stage"
- All 15-minute interval pills after second stage are properly styled
- Visual distinction between first stage (blue) and second stage (green) pills is restored

## 📊 Expected Behavior
Based on the console logs:
- First stage: `01:23` through `07:23` (30-min and 60-min intervals) - Blue pills
- Second stage: `07:30` through `09:00` (15-min intervals) - Green pills with `[2nd]` tag

Second stage pills starting at `07:30` should now be visible and properly colored green.
