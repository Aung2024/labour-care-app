// ============================================================================
// SUMMARY DATA CONFIGURATIONS
// ============================================================================
// This file contains all the data structures and configurations for the summary page

// Section definitions for the labour care summary
export const sections = {
  "Supportive Care": [
    "Companion",
    "Pain_Relief", 
    "Oral_fluids",
    "Mobility"
  ],
  "Baby": [
    "Baseline FHR",
    "FHR deceleration",
    "Amniotic fluid",
    "Fetal position",
    "Caput",
    "Moulding"
  ],
  "Woman": [
    "Pulse",
    "Systolic BP",
    "Diastolic BP",
    "Temperature C",
    "Urine"
  ],
  "Labour Progress": [
    "Contractions per 10 min",
    "Duration of contractions"
  ],
  "Cervix Plot": [
    "Cervix [Plot X]"
  ],
  "Descent Plot": [
    "Descent [Plot O]"
  ],
  "Medication": [
    "Oxytocin (U/L, drops/min)",
    "Medicine",
    "IV fluids"
  ],
  "Shared Decision-Making": [
    "ASSESSMENT",
    "PLAN",
    "INITIALS"
  ]
};

// Dropdown options for form fields
export const dropdownOptions = {
  // Supportive care
  "Companion": ["Y", "N", "D"],
  "Pain_Relief": ["Y", "N", "D"],
  "Oral_fluids": ["Y", "N", "D"],
  "Mobility": ["M", "SP"],

  // Baby
  "FHR deceleration": ["N", "E", "L", "V"],
  "Amniotic fluid": ["I", "C", "M", "M+", "M++", "M+++", "B"],
  "Fetal position": ["A", "P", "T"],
  "Caput": ["0", "+", "++", "+++"],
  "Moulding": ["0", "+", "++", "+++"],

  // Woman
  "Pulse": ["<60", "60-100", ">100", ">120"],
  "Systolic BP": ["<90", "90-140", ">140"],
  "Diastolic BP": ["<60", "60-90", ">90"],
  "Temperature C": ["<36", "36-37.5", ">37.5"],
  "Urine": ["-/-", "P-", "P Trace", "P+", "P++", "P+++", "P++++", "A-", "A Trace", "A+", "A++", "A+++", "A++++"],

  // Labour Progress
  "Contractions per 10 min": ["<2", "2-5", ">5"],
  "Duration of contractions": ["<20s", "20-40s", ">40s"],
  "Cervix [Plot X]": ["", "X"],
  "Descent [Plot O]": ["", "O"],

  // Medication
  "Oxytocin (U/L, drops/min)": ["None", "Started", "Stopped"],
  "Medicine": ["None", "Started", "Stopped"],
  "IV fluids": ["None", "Started", "Stopped"]
};

// Alert values for WHO LCG guidelines
export const alertValues = {
  // Supportive care - WHO LCG values
  "Companion": ["N"], // N = No companion
  "Pain_Relief": ["N"], // N = No pain relief
  "Oral_fluids": ["N"], // N = No oral fluid
  "Mobility": ["SP"], // SP = Supine position

  // Baby - WHO LCG values
  "Baseline FHR": [], // Will be handled by number input range checking
  "FHR deceleration": ["L"], // L = Late decelerations
  "Amniotic fluid": ["M+++", "B"], // M+++ = Severe meconium, B = Bloody
  "Fetal position": ["P", "T"], // P = Posterior, T = Transverse
  "Caput": ["+++"], // +++ = Severe caput
  "Moulding": ["+++"], // +++ = Severe moulding

  // Woman - WHO LCG values
  "Pulse": [], // Will be handled by number input range checking
  "Systolic BP": [], // Will be handled by number input range checking
  "Diastolic BP": [], // Will be handled by number input range checking
  "Temperature C": [], // Will be handled by number input range checking
  "Urine": [] // Will be handled by dropdown selection
};

// WHO Alert Values for display in alert cells
export const whoAlertValues = {
  // Supportive care
  "Companion": "N",
  "Pain_Relief": "N", 
  "Oral_fluids": "N",
  "Mobility": "SP",

  // Baby
  "Baseline FHR": "110-160",
  "FHR deceleration": "L",
  "Amniotic fluid": "M+++, B",
  "Fetal position": "P, T",
  "Caput": "+++",
  "Moulding": "+++",

  // Woman
  "Pulse": "<60, >120",
  "Systolic BP": "<90, >140",
  "Diastolic BP": ">90",
  "Temperature C": "<36, >37.5",
  "Urine": "P++++, A++++"
};

// Clinical recommendations based on alert values
export const recommendations = {
  "Companion": {
    "N": "Encourage presence of a companion of choice for support."
  },
  "Mobility": {
    "SP": "Encourage upright or mobile posture for comfort and progress."
  },
  "Pain_Relief": {
    "N": "Assess pain and offer appropriate pain relief options."
  },
  "Oral_fluids": {
    "N": "Encourage oral fluid intake unless contraindicated."
  },
  "Baseline FHR": {
    "<110": "Assess for fetal distress. Prepare for immediate intervention.",
    ">160": "Assess for fetal distress. Prepare for immediate intervention."
  },
  "FHR deceleration": {
    "L": "Reassess fetal condition. Consider immediate intervention.",
    "V": "Monitor closely and reassess fetal condition."
  },
  "Amniotic fluid": {
    "M": "Monitor for fetal distress. Prepare for possible intervention.",
    "M+": "Monitor for fetal distress. Prepare for possible intervention.",
    "M++": "Monitor for fetal distress. Prepare for possible intervention.",
    "M+++": "Monitor for fetal distress. Prepare for possible intervention.",
    "B": "Assess for placental abruption or other complications."
  },
  "Fetal position": {
    "P": "Monitor labour progress. Consider position change or intervention.",
    "T": "Monitor labour progress. Consider position change or intervention."
  },
  "Caput": {
    "+": "Monitor for obstructed labour. Consider intervention.",
    "++": "Monitor for obstructed labour. Consider intervention.",
    "+++": "Monitor for obstructed labour. Consider intervention."
  },
  "Moulding": {
    "++": "Monitor for obstructed labour. Consider intervention.",
    "+++": "Monitor for obstructed labour. Consider intervention."
  },
  "Pulse": {
    "<50": "Assess for underlying causes. Monitor closely.",
    ">100": "Assess for infection, dehydration, pain, anxiety."
  },
  "Systolic BP": {
    "<90": "Assess for shock. Initiate appropriate management.",
    ">140": "Assess for pre-eclampsia. Initiate appropriate management."
  },
  "Diastolic BP": {
    "<60": "Assess for hypotension. Monitor closely.",
    ">90": "Assess for pre-eclampsia. Initiate appropriate management."
  },
  "Temperature C": {
    "<36.0": "Assess for hypothermia. Initiate warming measures.",
    ">37.5": "Assess for infection. Initiate appropriate management."
  },
  "Urine": {
    "P+": "Assess for pre-eclampsia. Monitor and manage.",
    "P++": "Assess for pre-eclampsia. Monitor and manage.",
    "P+++": "Assess for pre-eclampsia. Monitor and manage.",
    "P++++": "Assess for pre-eclampsia. Monitor and manage.",
    "A+": "Assess for diabetic ketoacidosis. Monitor and manage.",
    "A++": "Assess for diabetic ketoacidosis. Monitor and manage.",
    "A+++": "Assess for diabetic ketoacidosis. Monitor and manage.",
    "A++++": "Assess for diabetic ketoacidosis. Monitor and manage."
  },
  "Contractions per 10 min": {
    "<2": "Assess labour progress. Consider augmentation.",
    ">5": "Assess for uterine hyperstimulation. Consider tocolysis."
  },
  "Duration of contractions": {
    "<20": "Assess labour progress. Consider augmentation.",
    ">60": "Assess for uterine hyperstimulation. Consider tocolysis."
  }
};
