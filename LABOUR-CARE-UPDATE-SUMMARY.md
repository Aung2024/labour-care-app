# Labour Care Hub & Setup Update

## 🎯 Summary of Changes

### 1. Patient Care Hub - Labour Care Card
**Two buttons instead of one:**
- **Classic LCG** (Green button) → Goes to `summary.html` with patient ID
- **Carousel LCG** (Red button) → Goes to `labour-care-setup.html` with patient ID

**Visual Changes:**
- Two buttons side-by-side (grid layout)
- Classic LCG: Green gradient (#059669)
- Carousel LCG: Red gradient (#dc2626)
- Removed onclick from entire card (now only buttons are clickable)

### 2. Labour Care Setup - Data Loading
**NEW: Automatically loads existing data from Classic LCG**

When a midwife clicks "Carousel LCG" after using Classic LCG:
- ✅ Loads Active First Stage Start Time
- ✅ Loads Second Stage Start Time  
- ✅ Loads Labour Onset (Spontaneous/Induced)
- ✅ Loads Active Labour Diagnosis
- ✅ Loads Ruptured Membrane time
- ✅ All fields are pre-filled if they exist

**Data Sources (in order of priority):**
1. `patients/[id]/records/summary` document
2. `patients/[id]` document fields

**Back button:** Now goes to `patient-care-hub.html` instead of `list.html`

## 📋 Technical Details

### Navigation Functions Added
```javascript
function navigateToLabourClassic() {
  window.location.href = 'summary.html?patient=' + selectedPatient.id;
}

function navigateToLabourCarousel() {
  window.location.href = 'labour-care-setup.html?patient=' + selectedPatient.id;
}
```

### Data Loading Function
```javascript
async function loadExistingLabourData(patientId) {
  // Loads from patients/[id]/records/summary
  // Populates all form fields with existing data
}
```

### CSS Changes
```css
.labour-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}

.care-action.labour-classic {
  background: linear-gradient(135deg, #059669, #047857);
}

.care-action.labour-carousel {
  background: linear-gradient(135deg, #dc2626, #b91c1c);
}
```

## ✅ User Experience Flow

### Scenario 1: New Labour Care Entry
1. Midwife clicks "Carousel LCG"
2. Setup page opens (no pre-filled data)
3. Midwife enters times
4. Clicks "Record Labour Care Grid"
5. Goes to entry page (carousel mode)

### Scenario 2: Data Exists in Classic LCG
1. Midwife previously used Classic LCG
2. Data saved in Firestore (`summary` document)
3. Midwife clicks "Carousel LCG"
4. Setup page opens with ALL data pre-filled
5. Midwife can adjust times or click "Record Labour Care Grid"
6. Goes to entry page (carousel mode) with existing data

### Scenario 3: Switch Between LCG Types
- Classic LCG and Carousel LCG share the same data source
- Midwife can freely switch between them
- Data is preserved and synchronized
- No data loss when switching modes

## 🔄 Data Flow

```
Classic LCG (summary.html)
    ↓
Saves to: patients/[id]/records/summary
    ↓
Carousel LCG Setup (labour-care-setup.html)
    ↓
Loads from: patients/[id]/records/summary
    ↓
Saves to: patients/[id]/records/summary (same document)
    ↓
Entry Page (labour-care-entry.html)
```

## 📝 Field Mappings

| Classic LCG Field | Carousel Setup Field | Firestore Location |
|------------------|---------------------|-------------------|
| Starting Time | firstStageStart | summary.startingTime |
| Second Stage Time | secondStageStart | summary.secondStageTime |
| Labour Onset | labourOnset | summary.labour_onset |
| Active Labour | activeLabour | summary.active_labour |
| Ruptured Membrane | rupturedMembrane | summary.ruptured_membrane |

## ✅ Testing Checklist

- [ ] Classic LCG button navigates to summary.html
- [ ] Carousel LCG button navigates to setup page
- [ ] Setup page loads existing times from Classic LCG
- [ ] Setup page loads labour onset data
- [ ] Setup page loads active labour diagnosis
- [ ] Setup page loads ruptured membrane time
- [ ] Data is pre-filled correctly
- [ ] Midwife can modify pre-filled data
- [ ] New entries work (no existing data)
- [ ] Back button goes to patient hub
- [ ] No JavaScript errors
- [ ] Mobile responsive buttons

## 🚀 Status
All updates complete and ready for testing!

**Key Feature:** Data flows seamlessly between Classic and Carousel LCG modes!
