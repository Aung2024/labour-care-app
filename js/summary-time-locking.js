// ============================================================================
// TIME INPUT LOCKING FUNCTIONALITY
// ============================================================================
// This file contains functions for locking time inputs after first use

// Lock time input after first use
export function lockTimeInput(inputId, inputLabel) {
  const input = document.getElementById(inputId);
  if (!input) return;
  
  // Check if already locked
  if (isTimeInputLocked(inputId)) {
    console.log(`🔒 ${inputLabel} input is already locked`);
    return;
  }
  
  // Disable the input
  input.disabled = true;
  input.readOnly = true;
  
  // Add CSS class for locked styling
  input.classList.add('time-input-locked');
  
  // Add a lock icon and label
  const lockIcon = document.createElement('i');
  lockIcon.className = 'fas fa-lock lock-icon';
  lockIcon.title = `${inputLabel} is locked and cannot be changed`;
  
  // Insert the lock icon after the input
  input.parentNode.insertBefore(lockIcon, input.nextSibling);
  
  // Add a small note below the input
  const note = document.createElement('small');
  note.className = 'lock-note';
  note.textContent = `${inputLabel} is now locked and cannot be modified`;
  
  // Insert the note after the input
  input.parentNode.insertBefore(note, input.nextSibling);
  
  console.log(`🔒 ${inputLabel} input locked successfully`);
}

// Check if time input is already locked
export function isTimeInputLocked(inputId) {
  const input = document.getElementById(inputId);
  if (!input) return false;
  return input.disabled && input.readOnly && input.classList.contains('time-input-locked');
}

// Unlock time input (for admin purposes)
export function unlockTimeInput(inputId, inputLabel) {
  const input = document.getElementById(inputId);
  if (!input) return;
  
  // Check if it's actually locked
  if (!isTimeInputLocked(inputId)) {
    console.log(`🔓 ${inputLabel} input is not locked`);
    return;
  }
  
  // Enable the input
  input.disabled = false;
  input.readOnly = false;
  
  // Remove CSS class for locked styling
  input.classList.remove('time-input-locked');
  
  // Remove lock icon
  const lockIcon = input.parentNode.querySelector('.lock-icon');
  if (lockIcon) {
    lockIcon.remove();
  }
  
  // Remove lock note
  const lockNote = input.parentNode.querySelector('.lock-note');
  if (lockNote) {
    lockNote.remove();
  }
  
  console.log(`🔓 ${inputLabel} input unlocked successfully`);
}

// Show lock status for all time inputs
export function showTimeInputLockStatus() {
  console.log('🔒 Time Input Lock Status:');
  console.log(`Starting Time: ${isTimeInputLocked("startingTime") ? 'LOCKED' : 'UNLOCKED'}`);
  console.log(`Second Stage Time: ${isTimeInputLocked("secondStageTime") ? 'LOCKED' : 'UNLOCKED'}`);
}

// Save starting time to Firestore
export async function saveStartingTime() {
  try {
    const patientId = getPatientIdFromUrl();
    if (!patientId) {
      console.error('No patient ID found');
      return;
    }
    
    const startingTimeData = {
      startingTime: activeFirstStageStartTime,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      updatedBy: firebase.auth().currentUser?.uid || 'unknown'
    };
    
    await firebase.firestore()
      .collection("patients")
      .doc(patientId)
      .collection("records")
      .doc("startingTime")
      .set(startingTimeData);
    
    console.log('✅ Starting time saved successfully:', activeFirstStageStartTime);
  } catch (error) {
    console.error('❌ Error saving starting time:', error);
    showSaveError('Failed to save starting time: ' + error.message);
  }
}

// Save second stage data to Firestore
export async function saveSecondStageData() {
  try {
    const patientId = getPatientIdFromUrl();
    if (!patientId) {
      console.error('No patient ID found');
      return;
    }
    
    const secondStageData = {
      secondStageStartTime: secondStageStartTime,
      firstStageDuration: firstStageDuration,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      updatedBy: firebase.auth().currentUser?.uid || 'unknown'
    };
    
    await firebase.firestore()
      .collection("patients")
      .doc(patientId)
      .collection("records")
      .doc("secondStage")
      .set(secondStageData);
    
    console.log('✅ Second stage data saved successfully');
  } catch (error) {
    console.error('❌ Error saving second stage data:', error);
    showSaveError('Failed to save second stage data: ' + error.message);
  }
}

// Load second stage data from Firestore
export async function loadSecondStageData() {
  try {
    const patientId = getPatientIdFromUrl();
    if (!patientId) return;
    
    const secondStageDoc = await firebase.firestore()
      .collection("patients")
      .doc(patientId)
      .collection("records")
      .doc("secondStage")
      .get();
    
    if (secondStageDoc.exists) {
      const data = secondStageDoc.data();
      secondStageStartTime = data.secondStageStartTime;
      firstStageDuration = data.firstStageDuration;
      
      if (secondStageStartTime) {
        document.getElementById("secondStageTime").value = secondStageStartTime;
        document.getElementById("secondStageCard").style.display = "block";
        
        // Lock the second stage time input since it was already set
        lockTimeInput("secondStageTime", "Second Stage Start Time");
        
        // Calculate and display first stage duration
        if (activeFirstStageStartTime && secondStageStartTime) {
          const firstTime = new Date(`2000-01-01T${activeFirstStageStartTime}:00`);
          const secondTime = new Date(`2000-01-01T${secondStageStartTime}:00`);
          const durationMs = secondTime - firstTime;
          const durationHours = Math.floor(durationMs / (1000 * 60 * 60));
          const durationMinutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
          
          firstStageDuration = `${durationHours}h ${durationMinutes}m`;
          document.getElementById("firstStageDuration").textContent = firstStageDuration;
        }
      }
    }
  } catch (error) {
    console.error('Error loading second stage data:', error);
  }
}

// Confirm second stage and update colors
export function confirmSecondStage() {
  if (!secondStageTime) {
    alert('Please set the second stage start time first.');
    return;
  }
  
  // Calculate first stage duration
  if (activeFirstStageStartTime && secondStageStartTime) {
    const firstTime = new Date(`2000-01-01T${activeFirstStageStartTime}:00`);
    const secondTime = new Date(`2000-01-01T${secondStageStartTime}:00`);
    const durationMs = secondTime - firstTime;
    const durationHours = Math.floor(durationMs / (1000 * 60 * 60));
    const durationMinutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
    
    firstStageDuration = `${durationHours}h ${durationMinutes}m`;
    document.getElementById("firstStageDuration").textContent = firstStageDuration;
  }
  
  // Update second stage colors
  updateSecondStageColors();
  
  // Save the second stage time
  saveSecondStageData();
  
  // Lock the second stage time input after confirmation
  lockTimeInput("secondStageTime", "Second Stage Start Time");
  
  // Regenerate tables with second stage time columns
  regenerateTablesForSecondStage();
  
  console.log('✅ Second stage confirmed and tables regenerated');
}

// Update second stage colors for all tables
export function updateSecondStageColors() {
  // Update time column headers
  const timeHeaders = document.querySelectorAll('.time-column');
  timeHeaders.forEach(header => {
    const time = header.textContent;
    if (isSecondStageTime(time)) {
      header.classList.add('second-stage');
    } else {
      header.classList.remove('second-stage');
    }
  });
  
  // Update data cells
  const dataCells = document.querySelectorAll('.data-cell');
  dataCells.forEach(cell => {
    const timeColumn = cell.closest('td')?.cellIndex;
    if (timeColumn && timeColumn > 1) { // Skip field and alert columns
      const timeHeader = document.querySelector(`.time-column:nth-child(${timeColumn + 1})`);
      if (timeHeader && timeHeader.classList.contains('second-stage')) {
        cell.classList.add('second-stage');
      } else {
        cell.classList.remove('second-stage');
      }
    }
  });
  
  console.log('✅ Second stage colors updated');
}

// Check if a time is in the second stage
export function isSecondStageTime(time) {
  if (!activeFirstStageStartTime || !secondStageStartTime) return false;
  
  const firstTime = new Date(`2000-01-01T${activeFirstStageStartTime}:00`);
  const secondTime = new Date(`2000-01-01T${secondStageStartTime}:00`);
  const checkTime = new Date(`2000-01-01T${time}:00`);
  
  return checkTime >= secondTime;
}

// Generate dynamic time columns based on starting time
export function generateDynamicTimeColumns() {
  if (!activeFirstStageStartTime) {
    console.log('No starting time set, using default time columns');
    return;
  }
  
  const startHour = parseInt(activeFirstStageStartTime.split(':')[0]);
  const startMinute = parseInt(activeFirstStageStartTime.split(':')[1]);
  
  // Generate time columns starting from the starting time
  timeCols = [];
  for (let hour = startHour; hour <= startHour + 12; hour++) {
    for (let minute = 0; minute < 60; minute += 30) {
      if (hour === startHour && minute < startMinute) continue; // Skip times before starting time
      const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
      timeCols.push(timeStr);
    }
  }
  
  console.log('Generated dynamic time columns:', timeCols);
  
  // Update the time columns display
  populateTimeColumns();
}

// Generate time columns for specific table types
export function generateTimeColumnsForTable(tableType, isSecondStage = false) {
  if (!activeFirstStageStartTime) return [];
  
  const startHour = parseInt(activeFirstStageStartTime.split(':')[0]);
  const startMinute = parseInt(activeFirstStageStartTime.split(':')[0]);
  
  let timeColumns = [];
  
  if (isSecondStage && secondStageStartTime) {
    // Second stage: 3 hours with appropriate intervals
    const secondStageHour = parseInt(secondStageStartTime.split(':')[0]);
    
    switch (tableType) {
      case 'fhr':
        // FHR table: 15-minute intervals for 3 hours (12 columns)
        for (let hour = secondStageHour; hour < secondStageHour + 3; hour++) {
          for (let minute = 0; minute < 60; minute += 15) {
            const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
            timeColumns.push(timeStr);
          }
        }
        break;
        
      case 'baby':
        // Baby table: 30-minute intervals for 3 hours (6 columns)
        for (let hour = secondStageHour; hour < secondStageHour + 3; hour++) {
          for (let minute = 0; minute < 60; minute += 30) {
            const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
            timeColumns.push(timeStr);
          }
        }
        break;
        
      case 'contractions':
        // Contractions table: 15-minute intervals for 3 hours (12 columns)
        for (let hour = secondStageHour; hour < secondStageHour + 3; hour++) {
          for (let minute = 0; minute < 60; minute += 15) {
            const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
            timeColumns.push(timeStr);
          }
        }
        break;
        
      default:
        // Default: 30-minute intervals for 3 hours
        for (let hour = secondStageHour; hour < secondStageHour + 3; hour++) {
          for (let minute = 0; minute < 60; minute += 30) {
            const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
            timeColumns.push(timeStr);
          }
        }
    }
  } else {
    // First stage: 12 hours with appropriate intervals
    switch (tableType) {
      case 'fhr':
        // FHR table: 30-minute intervals for 12 hours
        for (let hour = startHour; hour <= startHour + 12; hour++) {
          for (let minute = 0; minute < 60; minute += 30) {
            if (hour === startHour && minute < startMinute) continue;
            const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
            timeColumns.push(timeStr);
          }
        }
        break;
        
      case 'baby':
        // Baby table: 1-hour intervals for 12 hours
        for (let hour = startHour; hour <= startHour + 12; hour++) {
          if (hour === startHour && startMinute > 0) continue;
          const timeStr = `${hour.toString().padStart(2, '0')}:00`;
          timeColumns.push(timeStr);
        }
        break;
        
      case 'contractions':
        // Contractions table: 30-minute intervals for 12 hours
        for (let hour = startHour; hour <= startHour + 12; hour++) {
          for (let minute = 0; minute < 60; minute += 30) {
            if (hour === startHour && minute < startMinute) continue;
            const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
            timeColumns.push(timeStr);
          }
        }
        break;
        
      default:
        // Default: 30-minute intervals for 12 hours
        for (let hour = startHour; hour <= startHour + 12; hour++) {
          for (let minute = 0; minute < 60; minute += 30) {
            if (hour === startHour && minute < startMinute) continue;
            const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
            timeColumns.push(timeStr);
          }
        }
    }
  }
  
  return timeColumns;
}

// Regenerate tables for second stage
export function regenerateTablesForSecondStage() {
  if (!secondStageStartTime) {
    console.log('No second stage time set');
    return;
  }
  
  console.log('🔄 Regenerating tables for second stage...');
  
  // Regenerate each table with appropriate time columns
  generateSupportiveCareTable();
  generateFHRTable();
  generateBabyTable();
  generateWomanTable();
  generateContractionsTable();
  
  // Update second stage colors
  updateSecondStageColors();
  
  console.log('✅ Tables regenerated for second stage');
}

// Populate time columns in the header
export function populateTimeColumns() {
  const timeColumnsContainer = document.getElementById('timeColumns');
  if (timeColumnsContainer) {
    timeColumnsContainer.innerHTML = timeCols.map(t => 
      `<div class="time-column">${t}</div>`
    ).join('');
  }
}
