// ============================================================================
// MAIN SUMMARY JAVASCRIPT FILE
// ============================================================================

import { 
  sections, 
  dropdownOptions, 
  whoAlertValues, 
  alertValues, 
  recommendations 
} from './summary-data.js';

import {
  getPatientIdFromUrl,
  checkAndHighlightAlert,
  addFormEventListeners,
  showRecommendations,
  getLatestValue,
  generateTimeColumns,
  testStickySupport,
  togglePatientInfo,
  toggleSection,
  initializeFoldedSections,
  populateTimeColumns,
  showSaveSuccess,
  showSaveError,
  showStartingTimeRequirement,
  hideAllTables,
  showAllTables
} from './summary-utils.js';

import {
  lockTimeInput,
  isTimeInputLocked,
  unlockTimeInput,
  showTimeInputLockStatus,
  saveStartingTime,
  saveSecondStageData,
  loadSecondStageData,
  confirmSecondStage,
  updateSecondStageColors,
  isSecondStageTime,
  generateDynamicTimeColumns,
  generateTimeColumnsForTable,
  regenerateTablesForSecondStage
} from './summary-time-locking.js';

import {
  generateSupportiveCareTable,
  generateFHRTable,
  generateBabyTable,
  generateWomanTable,
  generateContractionsTable,
  generateMedicationTable,
  generateSharedDecisionTable,
  generateInitialsTable,
  generateAllTables
} from './summary-tables.js';

// ============================================================================
// GLOBAL VARIABLES
// ============================================================================

let activeFirstStageStartTime = null;
let secondStageStartTime = null;
let firstStageDuration = null;
let timeCols = [];
let existing = {};

// ============================================================================
// MAIN FUNCTIONS
// ============================================================================

// Load data from Firestore
async function loadData() {
  try {
    // Get current user and their Firestore profile
    const user = firebase.auth().currentUser;
    if (!user) {
      document.body.innerHTML = '<div class="alert alert-danger">Not authenticated.</div>';
      return;
    }
      
    // Fetch user profile
    const userDoc = await firebase.firestore().collection("users").doc(user.uid).get();
    if (!userDoc.exists) {
      document.body.innerHTML = '<div class="alert alert-danger">User profile not found.</div>';
      return;
    }
    const userData = userDoc.data();

    // Get patient document
    const patientId = getPatientIdFromUrl();
    if (!patientId) {
      document.body.innerHTML = '<div class="alert alert-danger">Patient ID not found.</div>';
      return;
    }

    const patientDoc = await firebase.firestore().collection("patients").doc(patientId).get({ source: "server" });
    if (!patientDoc.exists) {
      document.body.innerHTML = '<div class="alert alert-danger">Patient not found.</div>';
      return;
    }
    const d = patientDoc.data();

    // Initialize existing data variable
    existing = {};

    // Access control: Super Admin always allowed, TMO if township matches, Midwife if createdBy matches
    let allowed = false;
      
    if (userData.role === "Super Admin" || userData.role === "admin") {
      allowed = true;
    } else if (userData.role === "TMO") {
      // TMO can access if township matches (handle cases where township might be undefined)
      const patientTownship = d.township || "";
      const userTownship = userData.township || "";
      if (patientTownship && userTownship && patientTownship === userTownship) {
        allowed = true;
      }
    } else if (userData.role === "Midwife" || userData.role === "midwife") {
      // Midwife can access if they created the patient
      if (d.createdBy === user.uid) {
        allowed = true;
      }
    }

    if (!allowed) {
      // Better error message based on role
      let errorMessage = "";
      if (userData.role === "TMO") {
        errorMessage = `Access Denied: You can only access patients in your township (${userData.township || 'undefined'}). This patient is in township: ${d.township || 'undefined'}.`;
      } else if (userData.role === "Midwife" || userData.role === "midwife") {
        errorMessage = `Access Denied: You can only access patients you created. This patient was created by: ${d.createdBy || 'unknown'}.`;
      } else {
        errorMessage = `Access Denied: You do not have permission to view this patient record. Please contact your administrator.`;
      }
      
      document.body.innerHTML = `
        <div class="alert alert-danger">
          <h4>Access Denied</h4>
          <p><strong>Reason:</strong> ${errorMessage}</p>
          <hr>
          <a href="list.html" class="btn btn-primary">← Back to Patient List</a>
        </div>
      `;
      return;
    }

    // Populate patient info
    document.getElementById("p_name").value = d.name || "";
    document.getElementById("p_age").value = d.age || "";
    document.getElementById("p_parity").value = d.parity || "";
    document.getElementById("p_onset").value = d.labour_onset || "";
    document.getElementById("p_active").value = d.active_labour || "";
    document.getElementById("p_membrane").value = d.ruptured_membrane || "";
    document.getElementById("p_risk").value = d.risk_factors || "";

    // Load starting time and second stage data
    try {
      const startingTimeDoc = await firebase.firestore().collection("patients").doc(patientId).collection("records").doc("startingTime").get();
      if (startingTimeDoc.exists) {
        const startingData = startingTimeDoc.data();
        activeFirstStageStartTime = startingData.startingTime;
        document.getElementById("startingTime").value = activeFirstStageStartTime;
        
        // Generate dynamic time columns based on starting time
        generateDynamicTimeColumns();
        
        // Load existing records from the new structure
        const recordsDoc = await firebase.firestore()
          .collection("patients")
          .doc(patientId)
          .collection("records")
          .doc("summary")
          .get();
        
        if (recordsDoc.exists) {
          const savedData = recordsDoc.data();
          const savedStartingTime = savedData.startingTime;
          
          // Only load data if the starting time matches (preserves data when starting time hasn't changed)
          if (savedStartingTime === activeFirstStageStartTime) {
            existing = savedData;
            console.log('Loading existing data with matching starting time:', savedStartingTime);
          } else {
            console.log('Starting time changed, not loading old data. Old:', savedStartingTime, 'New:', activeFirstStageStartTime);
            // Data will be cleared since starting time changed
          }
        }

        // Load medication data
        const medicationSnap = await firebase.firestore().collection("patients").doc(patientId).collection("medication").get({ source: "server" });
        medicationSnap.forEach(doc => {
          const d = doc.data();
          const time = d.time;
          
          // Store oxytocin data
          if (d.oxytocin) {
            existing[`Medication_Oxytocin_${time}`] = d.oxytocin;
            if (d.oxytocin === "Yes") {
              existing[`Medication_Oxytocin_${time}_UL`] = d.oxytocin_UL || "";
              existing[`Medication_Oxytocin_${time}_drops`] = d.oxytocin_drops || "";
            }
          }
          
          // Store medicine data
          if (d.medicine) {
            existing[`Medication_Medicine_${time}`] = d.medicine;
          }
          
          // Store IV fluids data
          if (d.iv_fluids) {
            existing[`Medication_IV_Fluids_${time}`] = d.iv_fluids;
          }
        });

        // Generate the summary table
        generateAllTables();
        
        // Load plotting data from previous sessions
        await loadPlotData();
        
        // Setup alert highlighting for real-time alerts
        addAlertHighlighting();
        
        // Add event listeners for form changes
        document.querySelectorAll('select, input').forEach(el => {
          el.addEventListener('change', function() {
            checkAndHighlightAlert(this);
            // Only show recommendations if the div exists
            if (document.getElementById('recommendations')) {
              showRecommendations();
            }
          });
        });

        // Add event listeners for starting time changes
        document.getElementById("startingTime").addEventListener("change", function() {
          // Check if input is locked
          if (isTimeInputLocked("startingTime")) {
            console.log("🔒 Starting time input is locked, ignoring change event");
            return;
          }
          
          const newStartingTime = this.value;
          if (newStartingTime) {
            const oldStartingTime = activeFirstStageStartTime;
            activeFirstStageStartTime = newStartingTime;
            
            // Generate new time columns
            generateDynamicTimeColumns();
            
            // Save the starting time
            saveStartingTime();
            
            // Lock the starting time input after first use
            lockTimeInput("startingTime", "Active First Stage Start Time");
            
            // Hide starting time requirement message
            document.getElementById("startingTimeRequirement").style.display = "none";
            
            // Show all tables immediately
            showAllTables();
            
            // Generate tables with empty data for new time schedule
            generateAllTables();
          }
        });

        // Load second stage data
        await loadSecondStageData();
        
        // Show all tables
        showAllTables();
        document.getElementById("startingTimeRequirement").style.display = "none";
        
        // Lock the starting time input since it was already set
        lockTimeInput("startingTime", "Active First Stage Start Time");
        
        // Generate the summary table with existing data
        generateAllTables();
        
      } else {
        // No starting time set yet
        hideAllTables();
        showStartingTimeRequirement();
      }
    } catch (error) {
      console.error("Error loading starting time data:", error);
      hideAllTables();
      showStartingTimeRequirement();
    }

    // Generate dynamic time columns
    generateDynamicTimeColumns();

    // Add event listeners for starting time changes
    document.getElementById("startingTime").addEventListener("change", function() {
      // Check if input is locked
      if (isTimeInputLocked("startingTime")) {
        console.log("🔒 Starting time input is locked, ignoring change event");
        return;
      }
      
      const newStartingTime = this.value;
      if (newStartingTime) {
        const oldStartingTime = activeFirstStageStartTime;
        activeFirstStageStartTime = newStartingTime;
        
        // Generate new time columns
        generateDynamicTimeColumns();
        
        // Save the starting time
        saveStartingTime();
        
        // Lock the starting time input after first use
        lockTimeInput("startingTime", "Active First Stage Start Time");
        
        // Hide starting time requirement message
        document.getElementById("startingTimeRequirement").style.display = "none";
        
        // Show all tables immediately
        showAllTables();
        
        // Generate tables with empty data for new time schedule
        generateAllTables();
      }
    });

    // Add event listener for second stage time input
    document.getElementById("secondStageTime").addEventListener("change", function() {
      // Check if input is locked
      if (isTimeInputLocked("secondStageTime")) {
        console.log("🔒 Second stage time input is locked, ignoring change event");
        return;
      }
      
      const newSecondStageTime = this.value;
      if (newSecondStageTime && activeFirstStageStartTime) {
        // Validate that second stage is after first stage
        const firstTime = new Date(`2000-01-01T${activeFirstStageStartTime}:00`);
        const secondTime = new Date(`2000-01-01T${newSecondStageTime}:00`);
        
        if (secondTime <= firstTime) {
          alert('Second stage must start after the active first stage start time.');
          this.value = '';
          return;
        }
        
        // Lock the second stage time input after first use
        lockTimeInput("secondStageTime", "Second Stage Start Time");
        
        // Show the second stage controls
        document.getElementById('secondStageControls').style.display = 'block';
      }
    });

  } catch (error) {
    console.error("Error loading data:", error);
    document.body.innerHTML = `<div class="alert alert-danger">Error loading data: ${error.message}</div>`;
  }
}

// ============================================================================
// PLOTTING AND CHARTS
// ============================================================================

// Initialize plotting charts
function initializePlottingCharts() {
  // Initialize cervix chart
  const cervixCanvas = document.getElementById('cervixChart');
  if (cervixCanvas) {
    setupChart(cervixCanvas, 'cervix');
  }
  
  // Initialize descent chart
  const descentCanvas = document.getElementById('descentChart');
  if (descentCanvas) {
    setupChart(descentCanvas, 'descent');
  }
}

// Setup chart
function setupChart(canvas, type) {
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  
  // Clear canvas
  ctx.clearRect(0, 0, width, height);
  
  // Draw grid
  drawGrid(ctx, width, height, type);
  
  // Draw labels
  drawLabels(ctx, width, height, type);
  
  // Add event listeners
  addChartEventListeners(canvas, type);
}

// Draw grid
function drawGrid(ctx, width, height, type) {
  ctx.strokeStyle = '#e9ecef';
  ctx.lineWidth = 1;
  
  // Vertical lines (time)
  for (let i = 0; i <= 15; i++) {
    const x = (i / 15) * width;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  
  // Horizontal lines (values)
  if (type === 'cervix') {
    for (let i = 0; i <= 10; i++) {
      const y = height - (i / 10) * height;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
  } else if (type === 'descent') {
    for (let i = 0; i <= 5; i++) {
      const y = height - (i / 5) * height;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
  }
}

// Draw labels
function drawLabels(ctx, width, height, type) {
  ctx.fillStyle = '#495057';
  ctx.font = '10px Arial';
  ctx.textAlign = 'center';
  
  // Time labels (bottom)
  for (let i = 0; i <= 15; i++) {
    const x = (i / 15) * width;
    const time = `${i.toString().padStart(2, '0')}:00`;
    ctx.fillText(time, x, height - 5);
  }
  
  // Value labels (left)
  if (type === 'cervix') {
    for (let i = 0; i <= 10; i++) {
      const y = height - (i / 10) * height;
      ctx.fillText(i.toString(), 15, y + 3);
    }
  } else if (type === 'descent') {
    for (let i = 0; i <= 5; i++) {
      const y = height - (i / 5) * height;
      ctx.fillText(i.toString(), 15, y + 3);
    }
  }
}

// Add chart event listeners
function addChartEventListeners(canvas, type) {
  canvas.addEventListener('click', (e) => handleChartClick(e, canvas, type));
}

// Handle chart click
function handleChartClick(e, canvas, type) {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  
  // Convert coordinates to values
  const time = Math.round((x / canvas.width) * 15);
  let value;
  
  if (type === 'cervix') {
    value = Math.round(10 - (y / canvas.height) * 10);
  } else if (type === 'descent') {
    value = Math.round(5 - (y / canvas.height) * 5);
  }
  
  // Validate values
  if (time >= 0 && time <= 15 && value >= 0 && value <= (type === 'cervix' ? 10 : 5)) {
    addPlotPoint(canvas, type, time, value);
  }
}

// Add plot point
function addPlotPoint(canvas, type, time, value) {
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  
  // Convert values to coordinates
  const x = (time / 15) * width;
  let y;
  
  if (type === 'cervix') {
    y = height - (value / 10) * height;
  } else if (type === 'descent') {
    y = height - (value / 5) * height;
  }
  
  // Draw point
  ctx.fillStyle = type === 'cervix' ? '#e74c3c' : '#3498db';
  ctx.beginPath();
  ctx.arc(x, y, 4, 0, 2 * Math.PI);
  ctx.fill();
  
  // Check for alerts
  checkPlottingAlerts(type, time, value);
  
  console.log(`Added ${type} point: Time ${time}:00, Value ${value}`);
}

// Check plotting alerts
function checkPlottingAlerts(type, time, value) {
  if (type === 'cervix' && value > 8) {
    console.log('⚠️ Alert: Cervix dilation > 8cm - consider second stage');
  } else if (type === 'descent' && value > 3) {
    console.log('⚠️ Alert: Descent > 3 - good progress');
  }
}

// ============================================================================
// DATA SAVING AND LOADING
// ============================================================================

// Save data to Firestore
async function saveData() {
  try {
    const patientId = getPatientIdFromUrl();
    if (!patientId) {
      showSaveError('No patient ID found');
      return;
    }
    
    // Collect all form data
    const formData = {};
    const allInputs = document.querySelectorAll('input, select');
    
    allInputs.forEach(input => {
      if (input.name && input.value) {
        formData[input.name] = input.value;
      }
    });
    
    // Add metadata
    formData.startingTime = activeFirstStageStartTime;
    formData.timestamp = firebase.firestore.FieldValue.serverTimestamp();
    formData.updatedBy = firebase.auth().currentUser?.uid || 'unknown';
    
    // Save to Firestore
    await firebase.firestore()
      .collection("patients")
      .doc(patientId)
      .collection("records")
      .doc("summary")
      .set(formData);
    
    console.log('✅ Data saved successfully');
    showSaveSuccess();
    
  } catch (error) {
    console.error('❌ Error saving data:', error);
    showSaveError('Failed to save data: ' + error.message);
  }
}

// Load plotting data
async function loadPlotData() {
  try {
    const patientId = getPatientIdFromUrl();
    if (!patientId) return;
    
    const plotDataDoc = await firebase.firestore()
      .collection("patients")
      .doc(patientId)
      .collection("records")
      .doc("plotData")
      .get();
    
    if (plotDataDoc.exists) {
      const data = plotDataDoc.data();
      console.log('Loaded plotting data:', data);
      
      // Redraw saved points
      if (data.cervixPoints) {
        data.cervixPoints.forEach(point => {
          addPlotPoint(document.getElementById('cervixChart'), 'cervix', point.time, point.value);
        });
      }
      
      if (data.descentPoints) {
        data.descentPoints.forEach(point => {
          addPlotPoint(document.getElementById('descentChart'), 'descent', point.time, point.value);
        });
      }
    }
  } catch (error) {
    console.error('Error loading plotting data:', error);
  }
}

// Add alert highlighting
function addAlertHighlighting() {
  // Add event listeners for form changes
  document.addEventListener('change', function(e) {
    if (e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT') {
      checkAndHighlightAlert(e.target);
    }
  });
  
  document.addEventListener('input', function(e) {
    if (e.target.tagName === 'INPUT') {
      checkAndHighlightAlert(e.target);
    }
  });
}

// ============================================================================
// EVENT LISTENERS AND INITIALIZATION
// ============================================================================

// Firebase auth state change listener
firebase.auth().onAuthStateChanged(function(user) {
  if (user) {
    console.log('User authenticated:', user.email);
    loadData();
  } else {
    console.log('User not authenticated');
    window.location.href = 'login.html';
  }
});

// DOM content loaded listener
document.addEventListener('DOMContentLoaded', function() {
  console.log('DOM loaded, initializing summary page...');
  
  // Initialize alert highlighting
  addAlertHighlighting();
  
  // Test if sticky positioning is supported
  testStickySupport();
  
  // Initialize folded sections
  initializeFoldedSections();
  
  // Show initial time input lock status
  setTimeout(() => {
    showTimeInputLockStatus();
  }, 1000); // Wait for data to load
});

// ============================================================================
// EXPORT FUNCTIONS FOR GLOBAL ACCESS
// ============================================================================

// Make functions available globally for HTML onclick handlers
window.saveData = saveData;
window.confirmSecondStage = confirmSecondStage;
window.togglePatientInfo = togglePatientInfo;
window.toggleSection = toggleSection;
window.unlockTimeInput = unlockTimeInput;
