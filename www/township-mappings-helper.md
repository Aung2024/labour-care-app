# Township Mapping Helper

This file helps map English township names from registration.html to Myanmar constituency codes in REGION_TSP_DATA.

## Mapping Pattern
```javascript
{ 
  englishName: 'English Township Name', 
  regionShort: 'REG', 
  tspCode: 'REG-XX', 
  stateOrRegion: 'Myanmar State/Region Name', 
  district: 'Myanmar District Name', 
  constituency: 'Myanmar Constituency Name' 
}
```

## How to Find Mappings

1. Find the English township name in registration.html (myanmarRegions object)
2. Find the corresponding Myanmar constituency name in REGION_TSP_DATA
3. Match them based on:
   - Region/State name
   - District name  
   - Township/Constituency name
4. Use the code from the constituency object as the tspCode

## Common Patterns
- Many English names are direct transliterations of Myanmar names
- Some have variations (e.g., "Dagon Myothit (South)" = "ဒဂုံမြို့သစ်(တောင်ပိုင်း)")
- Region codes are usually the first 3 letters of the TSP code (e.g., YGN-12 → YGN)

