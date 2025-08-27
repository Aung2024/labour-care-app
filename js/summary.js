// ============================================================================
// MAIN SUMMARY JAVASCRIPT FILE
// ============================================================================

import { sections, dropdownOptions, whoAlertValues } from './summary-data.js';
import { getPatientIdFromUrl, checkAndHighlightAlert } from './summary-utils.js';
import { lockTimeInput, isTimeInputLocked } from './summary-time-locking.js';

// Global variables
let activeFirstStageStartTime = null;
let secondStageStartTime = null;
let timeCols = [];
let existing = {};

// Initialize the page
document.addEventListener('DOMContentLoaded', function() {
  console.log('DOM loaded, initializing summary page...');
  initializePage();
});

// Initialize page functionality
function initializePage() {
  // Initialize time columns
  generateTimeColumns();
  
  // Add event listeners
  addEventListeners();
  
  // Load data if user is authenticated
  if (firebase.auth().currentUser) {
    loadData();
  }
}

// Generate time columns
function generateTimeColumns() {
  timeCols = [];
  for (let hour = 0; hour <= 15; hour++) {
    for (let minute = 0; minute < 60; minute += 30) {
      if (hour === 0 && minute === 0) continue;
      const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
      timeCols.push(timeStr);
    }
  }
}

// Add event listeners
function addEventListeners() {
  // Starting time input
  const startingTimeInput = document.getElementById("startingTime");
  if (startingTimeInput) {
    startingTimeInput.addEventListener("change", handleStartingTimeChange);
  }
  
  // Second stage time input
  const secondStageInput = document.getElementById("secondStageTime");
  if (secondStageInput) {
    secondStageInput.addEventListener("change", handleSecondStageTimeChange);
  }
}

// Handle starting time change
function handleStartingTimeChange() {
  if (isTimeInputLocked("startingTime")) {
    console.log("🔒 Starting time input is locked");
    return;
  }
  
  const newTime = this.value;
  if (newTime) {
    activeFirstStageStartTime = newTime;
    lockTimeInput("startingTime", "Active First Stage Start Time");
    generateTables();
  }
}

// Handle second stage time change
function handleSecondStageTimeChange() {
  if (isTimeInputLocked("secondStageTime")) {
    console.log("🔒 Second stage time input is locked");
    return;
  }
  
  const newTime = this.value;
  if (newTime && activeFirstStageStartTime) {
    secondStageStartTime = newTime;
    lockTimeInput("secondStageTime", "Second Stage Start Time");
    updateSecondStageColors();
  }
}

// Generate tables
function generateTables() {
  // Implementation for table generation
  console.log('Generating tables...');
}

// Update second stage colors
function updateSecondStageColors() {
  // Implementation for updating colors
  console.log('Updating second stage colors...');
}

// Load data from Firestore
async function loadData() {
  try {
    const patientId = getPatientIdFromUrl();
    if (!patientId) return;
    
    // Load patient data
    const patientDoc = await firebase.firestore()
      .collection("patients")
      .doc(patientId)
      .get();
    
    if (patientDoc.exists) {
      const data = patientDoc.data();
      populatePatientInfo(data);
    }
    
  } catch (error) {
    console.error('Error loading data:', error);
  }
}

// Populate patient information
function populatePatientInfo(data) {
  const nameInput = document.getElementById("p_name");
  const ageInput = document.getElementById("p_age");
  const parityInput = document.getElementById("p_parity");
  
  if (nameInput) nameInput.value = data.name || "";
  if (ageInput) ageInput.value = data.age || "";
  if (parityInput) parityInput.value = data.parity || "";
}

// Make functions globally available
window.saveData = function() {
  console.log('Save data function called');
  // Implementation for saving data
};

window.confirmSecondStage = function() {
  console.log('Confirm second stage function called');
  // Implementation for confirming second stage
};

window.togglePatientInfo = function() {
  const form = document.getElementById('patientForm');
  if (form) {
    form.style.display = form.style.display === 'none' ? 'block' : 'none';
  }
};

window.toggleSection = function(sectionId) {
  const section = document.getElementById(sectionId);
  if (section) {
    const isVisible = section.style.display !== 'none';
    section.style.display = isVisible ? 'none' : 'block';
  }
};
