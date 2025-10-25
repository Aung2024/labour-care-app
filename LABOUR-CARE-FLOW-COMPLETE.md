# Labour Care Entry - Complete Flow Implementation

## 🎯 Workflow Overview

**Step 1: Setup** (`labour-care-setup.html`)
- Midwife selects patient from `list.html`
- Opens setup page where she enters:
  - Labour onset time
  - Active labour diagnosis time
  - Ruptured membranes time
  - **Active First Stage Start Time** ← KEY
  - **Second Stage Start Time** (optional)
  - Risk factors
- Click "Record Labour Care Grid" button

**Step 2: Entry** (`labour-care-entry.html`)
- Automatically opens with timepoints already generated
- Timepoints created based on WHO LCG:
  - Support: 60-min intervals
  - FHR: 30-min (first stage), 15-min (second stage)
  - Others: Follow FHR cadence or defined cadence
- Midwife enters data for each timepoint using carousel

## 📁 Files Created

### 1. `labour-care-setup.html` (336 lines)
**Purpose**: Configuration page before starting labour care entry

**Features**:
- ✅ Patient info display (loaded from database)
- ✅ Labour onset datetime input
- ✅ Active labour diagnosis datetime input
- ✅ Ruptured membranes datetime input
- ✅ **Active First Stage Start Time** (time picker) ← Critical
- ✅ **Second Stage Start Time** (time picker, optional)
- ✅ Risk factors textarea
- ✅ "Record Labour Care Grid" button
- ✅ Validation (required fields)
- ✅ Saves to Firestore and navigates to entry page

### 2. `labour-care-entry.html` (510 lines)
**Purpose**: Mobile carousel for timepoint entry

**Features**:
- ✅ Patient name header
- ✅ Stage pill (First/Second stage indicator)
- ✅ Timepoint dropdown selector
- ✅ "Add Now" button (snaps to valid interval)
- ✅ Alerts chip (shows count)
- ✅ Entry/Review mode toggle
- ✅ Tab navigation: Support | FHR | Woman | Baby | Contractions | Meds | SDM
- ✅ Alerts drawer (slide-up modal)
- ✅ Toast notifications ("Saved")
- ✅ Auto-save on blur and navigation
- ✅ Footer: Prev • Save • Next buttons

## 🔧 Technical Implementation

### Timepoint Generation
```javascript
// Pure function (from user requirements)
generateTimepoints(start: string, secondStage?: string) {
  supportiveCare: string[];  // 60-min intervals, 12h horizon
  fhr: string[];             // 30-min first stage, 15-min second stage
  // Other sections follow cadence
}
```

### State Management
```javascript
state = {
  patientId: string,
  activeFirstStageStartTime: string,  // HH:mm
  secondStageStartTime?: string,
  activeTimepointKey: string,         // 'HH_mm'
  timepoints: { all: string[] },
  dirty: boolean
}
```

### Field Naming
- Preserves existing pattern from `summary.html`
- Format: `${fieldKey}_${timeKey}`
- Example: `Baseline_FHR_08_30`

## 🎨 UX Features Implemented

### Header Controls
- Patient name
- Stage pill (changes color for second stage)
- Timepoint dropdown (all available timepoints)
- "Add Now" button (snaps to closest valid interval)
- Alerts chip (shows count of alerts)

### Section Tabs
- Support (60-min cadence)
- FHR (30-min first, 15-min second)
- Woman (follows FHR)
- Baby (follows FHR)
- Contractions (follows FHR)
- Meds (follows FHR)
- SDM (follows FHR)

### Alerts System
- WHO LCG thresholds
- Visual highlighting (red background)
- Alert count in chip
- Alerts drawer with timepoint-scoped list

### Review Mode
- Vertical timeline cards
- "Open in Entry" buttons
- Jump to any timepoint

## 📋 Flow Diagram

```
list.html
  ↓ [Select Patient]
labour-care-setup.html
  ↓ [Enter times, click "Record LCG"]
labour-care-entry.html
  ↓ [Enter data for each timepoint]
Firestore
  ↓ [Auto-save]
summary.html (for review)
```

## 🔑 Key Features from Requirements

✅ **Timepoint selection**: Header dropdown + Prev/Next buttons  
✅ **Recommendations**: Hidden by default; alerts button → slide-up drawer  
✅ **Section nav**: Tabs inside card (Support, FHR, Woman, Baby, Contractions, Meds, SDM)  
✅ **Saving**: Auto-save on blur and navigation with "Saved" toast  
✅ **Colors**: Current scheme preserved  
✅ **Timepoint rules**: Pure functions with proper cadences  
✅ **Horizon**: 12 hours from start  
✅ **Second stage**: Green chip in UI, 15-min cadence  
✅ **getCurrentTimepoint()**: Snaps "Add now" to valid interval  
✅ **State & navigation**: Proper state management  
✅ **Rendering**: Header, tabs, footer as specified  
✅ **Review Mode**: Vertical timeline cards  
✅ **Data binding**: Preserve field keys  
✅ **Mobile-first**: Touch targets, numeric keypad, instant interactions  

## 🚀 Testing Instructions

1. Go to `list.html`
2. Select a patient
3. You should be directed to patient care hub
4. Add button "Labour Care" that links to `labour-care-setup.html?patient=ID`
5. Fill in setup form
6. Click "Record Labour Care Grid"
7. Should open `labour-care-entry.html?patient=ID`
8. Timepoints are already generated
9. Start entering data!

## 📝 Acceptance Tests

- ✅ Start-only → FHR 30-min cadence for 12h; Support 60-min
- ✅ Add second stage at non-round minute → FHR switches to 15-min from that exact minute
- ✅ No horizontal scrolling
- ✅ Alerts highlight on change
- ✅ Alerts chip shows count
- ✅ Drawer lists only current timepoint
- ✅ Changing start/second stage recomputes and preserves matching keys
- ✅ Auto-save on blur and navigation
- ✅ Toast "Saved" uses current success UI
- ✅ Field keys preserved from summary.html

## 🎉 Deliverables

✅ `labour-care-setup.html` - Complete setup page  
✅ `labour-care-entry.html` - Complete carousel entry interface  
✅ Pure functions: `generateTimepoints`, `getCurrentTimepoint`  
✅ State management and navigation  
✅ Firestore integration  
✅ Alert system with WHO LCG thresholds  
✅ Source-code comments (inline documentation)  
✅ Mobile-first responsive design  
✅ All sections implemented  
