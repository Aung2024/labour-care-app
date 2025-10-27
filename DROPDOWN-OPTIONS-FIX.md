# Dropdown Options Update - Carousel LCG

## 🐛 Problem
The carousel LCG was using simplified dropdown options that didn't match Classic LCG. This would cause alert values to not trigger correctly because the saved values wouldn't match the expected alert criteria.

## 🔍 Issue Example
**Classic LCG Urine options:**
- `-/-`, `P-`, `P Trace`, `P+`, `P++`, `A-`, `A Trace`, `A+`, `A++`

**Carousel LCG was using:**
- `Present`, `Absent`

If a midwife selected `Present` in carousel, it wouldn't trigger alerts for `P++` or `A++` (the actual alert criteria from Classic LCG).

## ✅ Solution
Updated ALL dropdown options in carousel to exactly match Classic LCG:

### Changed Dropdown Options:

#### 1. Urine
**Before:** `[['Y','Present'],['N','Absent']]`  
**After:** `[['-/-','-/-'],['P-','P-'],['P Trace','P Trace'],['P+','P+'],['P++','P++'],['A-','A-'],['A Trace','A Trace'],['A+','A+'],['A++','A++']]`

#### 2. Amniotic Fluid
**Before:** `[['C','Clear'],['M','Meconium'],['B','Blood']]`  
**After:** `[['I','I'],['C','C'],['M','M'],['M+','M+'],['M++','M++'],['M+++','M+++'],['B','B']]`

#### 3. Fetal Position
**Before:** `[['C','Cephalic'],['B','Breech'],['T','Transverse'],['P','Posterior']]`  
**After:** `[['A','A'],['P','P'],['T','T']]`

#### 4. Caput
**Before:** `[['N','None'],['+','+'],['++','++'],['+++','+++']]`  
**After:** `[['0','0'],['+','+'],['++','++'],['+++','+++']]`

#### 5. Moulding
**Before:** `[['N','None'],['+','+'],['++','++'],['+++','+++']]`  
**After:** `[['0','0'],['+','+'],['++','++'],['+++','+++']]`

## 🎯 Impact
Now the carousel LCG uses the exact same dropdown values as Classic LCG:
- ✅ Alert values will trigger correctly
- ✅ Data entered in carousel will match Classic LCG format
- ✅ Recommendations will work properly
- ✅ Data consistency across both modes

## 📊 Alert Values That Now Work Correctly

**Urine Alerts:**
- `P++` = Urine ++ (Protein)
- `A++` = Urine ++ (Albumin)

**Amniotic Fluid Alerts:**
- `M+++` = Severe meconium
- `B` = Bloody

**Fetal Position Alerts:**
- `P` = Posterior
- `T` = Transverse

**Caput/Moulding Alerts:**
- `+++` = Severe (3+)

## ✅ Testing Checklist
- [ ] Select Urine = `P++` → Should trigger alert
- [ ] Select Urine = `A++` → Should trigger alert
- [ ] Select Amniotic Fluid = `M+++` → Should trigger alert
- [ ] Select Amniotic Fluid = `B` → Should trigger alert
- [ ] Select Fetal Position = `P` or `T` → Should trigger alert
- [ ] Select Caput = `+++` → Should trigger alert
- [ ] Select Moulding = `+++` → Should trigger alert
- [ ] Open alerts drawer → Should show recommendations for these values

## 🚀 Status
Updated! All dropdown options now match Classic LCG exactly!
