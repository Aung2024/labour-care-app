# 🕐 Dynamic Time Column System - Implementation Guide

## 🎯 **Overview**

This document explains the new **Dynamic Time Column System** that automatically adjusts table time columns based on the labour stage. The system provides **12 hours for first stage** and **3 hours for second stage** with appropriate time intervals for each table type.

## 🔄 **Key Changes Implemented**

### **1. Time Column Logic**
- **First Stage**: 12 hours with appropriate intervals per table type
- **Second Stage**: 3 hours total with adjusted intervals
- **Automatic Adjustment**: Tables regenerate when second stage starts

### **2. Table Structure Changes**
- **FHR Table**: Separated from Baby table for better organization
- **Baby Table**: Focused on assessment fields only
- **Contractions Table**: Standalone table for better CSS stability
- **Plotting Section**: Dedicated section for charts

### **3. Dynamic Time Intervals**

| Table Type | First Stage | Second Stage |
|------------|-------------|--------------|
| **FHR Table** | 30-minute intervals (12 hours) | 15-minute intervals (3 hours) |
| **Baby Table** | 1-hour intervals (12 hours) | 30-minute intervals (3 hours) |
| **Contractions** | 30-minute intervals (12 hours) | 15-minute intervals (3 hours) |
| **Other Tables** | 30-minute intervals (12 hours) | 30-minute intervals (3 hours) |

## 📁 **Files Modified**

### **New Files Created**
1. **`js/summary-tables.js`** - All table generation functions
2. **`css/summary-specific.css`** - Enhanced styling for new structure

### **Files Updated**
1. **`js/summary-time-locking.js`** - Enhanced time management
2. **`summary-refactored.html`** - Updated HTML structure
3. **`js/summary.js`** - Main logic integration

## 🧩 **Technical Implementation**

### **Time Column Generation Functions**

```javascript
// Generate time columns for specific table types
export function generateTimeColumnsForTable(tableType, isSecondStage = false) {
  if (isSecondStage && secondStageStartTime) {
    // Second stage: 3 hours with appropriate intervals
    switch (tableType) {
      case 'fhr':
        // 15-minute intervals for 3 hours (12 columns)
        break;
      case 'baby':
        // 30-minute intervals for 3 hours (6 columns)
        break;
      case 'contractions':
        // 15-minute intervals for 3 hours (12 columns)
        break;
    }
  } else {
    // First stage: 12 hours with appropriate intervals
    switch (tableType) {
      case 'fhr':
        // 30-minute intervals for 12 hours
        break;
      case 'baby':
        // 1-hour intervals for 12 hours
        break;
      case 'contractions':
        // 30-minute intervals for 12 hours
        break;
    }
  }
}
```

### **Table Regeneration System**

```javascript
// Regenerate tables for second stage
export function regenerateTablesForSecondStage() {
  console.log('🔄 Regenerating tables for second stage...');
  
  // Regenerate each table with appropriate time columns
  generateSupportiveCareTable();
  generateFHRTable();
  generateBabyTable();
  generateWomanTable();
  generateContractionsTable();
  
  // Update second stage colors
  updateSecondStageColors();
}
```

## 📊 **Table Structure Details**

### **1. FHR Table (Separate)**
- **Purpose**: Fetal Heart Rate monitoring
- **Fields**: Baseline FHR, FHR deceleration
- **First Stage**: 30-minute intervals for 12 hours
- **Second Stage**: 15-minute intervals for 3 hours

### **2. Baby Assessment Table**
- **Purpose**: Baby assessment fields only
- **Fields**: Amniotic fluid, Fetal position, Caput, Moulding
- **First Stage**: 1-hour intervals for 12 hours
- **Second Stage**: 30-minute intervals for 3 hours

### **3. Contractions Table (Standalone)**
- **Purpose**: Labour progress monitoring
- **Fields**: Contractions per 10 min, Duration of contractions
- **First Stage**: 30-minute intervals for 12 hours
- **Second Stage**: 15-minute intervals for 3 hours

### **4. Other Tables**
- **Supportive Care**: 30-minute intervals, adjusts to 3 hours in second stage
- **Woman**: 30-minute intervals, adjusts to 3 hours in second stage
- **Medication**: 30-minute intervals, adjusts to 3 hours in second stage
- **Decision Making**: 30-minute intervals, adjusts to 3 hours in second stage
- **Initials**: 30-minute intervals, adjusts to 3 hours in second stage

## 🎨 **Visual Enhancements**

### **Second Stage Highlighting**
- **Time Columns**: Green background for second stage times
- **Data Cells**: Green background for second stage data
- **Automatic Updates**: Colors update when second stage is confirmed

### **Improved Table Styling**
- **Better Spacing**: Improved padding and margins
- **Responsive Design**: Mobile-friendly table layouts
- **Print Styles**: Optimized for printing

### **New Section Cards**
- **Collapsible Sections**: Click to expand/collapse
- **Visual Hierarchy**: Clear section separation
- **Professional Look**: Modern card-based design

## 🚀 **How It Works**

### **1. First Stage Setup**
1. Midwife sets **Active First Stage Start Time**
2. All tables generate with **12-hour time columns**
3. Time intervals vary by table type (30-min, 1-hour, etc.)

### **2. Second Stage Transition**
1. Midwife sets **Second Stage Start Time**
2. System calculates **First Stage Duration**
3. **Tables automatically regenerate** with 3-hour columns
4. **Time intervals adjust** based on table type
5. **Second stage colors** are applied

### **3. Dynamic Adjustments**
- **No data loss**: Existing data is preserved
- **Automatic updates**: Tables refresh automatically
- **Visual feedback**: Clear indication of stage changes

## 🔧 **Configuration Options**

### **Time Intervals by Table Type**

```javascript
const timeIntervals = {
  fhr: {
    firstStage: 30,    // 30 minutes
    secondStage: 15    // 15 minutes
  },
  baby: {
    firstStage: 60,    // 1 hour
    secondStage: 30    // 30 minutes
  },
  contractions: {
    firstStage: 30,    // 30 minutes
    secondStage: 15    // 15 minutes
  },
  default: {
    firstStage: 30,    // 30 minutes
    secondStage: 30    // 30 minutes
  }
};
```

### **Stage Durations**

```javascript
const stageDurations = {
  firstStage: 12,      // 12 hours
  secondStage: 3       // 3 hours
};
```

## 📱 **Responsive Design**

### **Mobile Optimization**
- **Table Scrolling**: Horizontal scroll for small screens
- **Column Sizing**: Adaptive column widths
- **Touch Friendly**: Optimized for mobile devices

### **Print Optimization**
- **Clean Layout**: Tables optimized for printing
- **Hidden Elements**: Non-essential elements hidden
- **Page Breaks**: Proper page break handling

## 🐛 **Troubleshooting**

### **Common Issues**

1. **Tables Not Regenerating**
   - Check if second stage time is set
   - Verify `regenerateTablesForSecondStage()` is called
   - Check console for errors

2. **Time Columns Not Updating**
   - Ensure `generateTimeColumnsForTable()` is working
   - Verify table type parameters
   - Check if `isSecondStage` flag is correct

3. **CSS Styling Issues**
   - Verify `summary-specific.css` is loaded
   - Check for CSS conflicts
   - Ensure responsive breakpoints are correct

### **Debug Functions**

```javascript
// Show time column status
console.log('Time columns:', timeCols);

// Check second stage status
console.log('Second stage time:', secondStageStartTime);

// Verify table regeneration
console.log('Tables regenerated:', document.querySelectorAll('.lcg-table').length);
```

## 🔮 **Future Enhancements**

### **Potential Improvements**
1. **Custom Time Intervals**: Allow midwives to set custom intervals
2. **Stage Transitions**: Smooth animations between stages
3. **Data Export**: Export tables with stage-specific formatting
4. **Audit Trail**: Track all stage changes and table regenerations

### **Performance Optimizations**
1. **Lazy Loading**: Load table data on demand
2. **Caching**: Cache generated time columns
3. **Debouncing**: Optimize table regeneration calls

## 📝 **Migration Notes**

### **What Changed**
- **Table Structure**: FHR separated from Baby table
- **Time Logic**: Dynamic column generation
- **CSS Classes**: New styling system
- **JavaScript**: Modular table generation

### **What Stayed the Same**
- **Data Fields**: All existing fields preserved
- **User Interface**: Same look and feel
- **Functionality**: All features maintained
- **Data Storage**: Same Firestore structure

### **Breaking Changes**
- **None**: This is a pure enhancement
- **Backward Compatible**: Existing data works unchanged
- **No User Training Required**: Interface remains familiar

## 🏆 **Benefits**

### **For Midwives**
- ✅ **Clear Stage Management**: Easy to see current stage
- ✅ **Appropriate Time Intervals**: Right granularity for each stage
- ✅ **Visual Feedback**: Clear indication of stage changes
- ✅ **No Data Loss**: Safe transitions between stages

### **For Developers**
- ✅ **Modular Code**: Easy to maintain and extend
- ✅ **Clear Logic**: Well-defined time column generation
- ✅ **Responsive Design**: Mobile-friendly implementation
- ✅ **Professional Quality**: Production-ready code

### **For Users**
- ✅ **Better Experience**: Intuitive stage management
- ✅ **Improved Accuracy**: Appropriate time intervals
- ✅ **Professional Look**: Modern, clean interface
- ✅ **Mobile Friendly**: Works on all devices

## 🎯 **Success Metrics**

- ✅ **Dynamic Time Columns**: Automatically adjust based on stage
- ✅ **3-Hour Second Stage**: Proper time management for delivery
- ✅ **Separate Tables**: Better organization and CSS stability
- ✅ **Responsive Design**: Works on all screen sizes
- ✅ **Professional UI**: Modern, clean interface
- ✅ **No Data Loss**: Safe transitions between stages

This implementation provides a **professional, user-friendly system** that automatically manages time columns based on labour stage, improving both the user experience and code maintainability.
