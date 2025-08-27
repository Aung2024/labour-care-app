// ============================================================================
// SUMMARY UTILITY FUNCTIONS
// ============================================================================
// This file contains utility functions for the summary page

import { alertValues, recommendations } from './summary-data.js';

// Get patient ID from URL parameters
export function getPatientIdFromUrl() {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('patient');
}

// Check and highlight alert values
export function checkAndHighlightAlert(element) {
  if (!element) return;
  
  const fieldName = element.name;
  const value = element.value;
  
  // Remove any existing alert highlighting
  element.classList.remove('alert-value');
  
  // Check for alert conditions based on field and value
  if (fieldName.includes('Companion') && value === 'N') {
    element.classList.add('alert-value');
  } else if (fieldName.includes('Mobility') && value === 'SP') {
    element.classList.add('alert-value');
  } else if (fieldName.includes('Baseline_FHR')) {
    const fhr = parseFloat(value);
    if (fhr < 110 || fhr > 160) {
      element.classList.add('alert-value');
    }
  } else if (fieldName.includes('Pulse')) {
    const pulse = parseFloat(value);
    if (pulse < 50 || pulse > 100) {
      element.classList.add('alert-value');
    }
  } else if (fieldName.includes('Systolic_BP')) {
    const bp = parseFloat(value);
    if (bp < 90 || bp > 140) {
      element.classList.add('alert-value');
    }
  } else if (fieldName.includes('Diastolic_BP')) {
    const bp = parseFloat(value);
    if (bp < 60 || bp > 90) {
      element.classList.add('alert-value');
    }
  } else if (fieldName.includes('Temperature_C')) {
    const temp = parseFloat(value);
    if (temp < 36.0 || temp > 37.5) {
      element.classList.add('alert-value');
    }
  } else if (fieldName.includes('FHR_deceleration') && value === 'L') {
    element.classList.add('alert-value');
  } else if (fieldName.includes('Amniotic_fluid') && (value === 'M' || value === 'M+' || value === 'M++' || value === 'M+++')) {
    element.classList.add('alert-value');
  } else if (fieldName.includes('Fetal_position') && value === 'T') {
    element.classList.add('alert-value');
  } else if (fieldName.includes('Caput') && (value === '+' || value === '++' || value === '+++')) {
    element.classList.add('alert-value');
  } else if (fieldName.includes('Moulding') && (value === '++' || value === '+++')) {
    element.classList.add('alert-value');
  } else if (fieldName.includes('Pain_Relief') && value === 'N') {
    element.classList.add('alert-value');
  } else if (fieldName.includes('Oral_fluids') && value === 'N') {
    element.classList.add('alert-value');
  } else if (fieldName.includes('Contractions_per_10_min')) {
    const contractions = parseFloat(value);
    if (contractions < 2 || contractions > 5) {
      element.classList.add('alert-value');
    }
  } else if (fieldName.includes('Duration_of_contractions')) {
    const duration = parseFloat(value);
    if (duration < 20 || duration > 60) {
      element.classList.add('alert-value');
    }
  } else if (fieldName.includes('Urine')) {
    if (value.includes('P') || value.includes('A')) {
      element.classList.add('alert-value');
    }
  }
}

// Add form event listeners
export function addFormEventListeners() {
  // Add event listeners to all selects and inputs
  const allSelects = document.querySelectorAll('select');
  const allInputs = document.querySelectorAll('input');
  
  allSelects.forEach(select => {
    select.addEventListener('change', function() {
      checkAndHighlightAlert(this);
      // Only show recommendations if the div exists
      if (document.getElementById('recommendations')) {
        showRecommendations();
      }
    });
  });
  
  allInputs.forEach(input => {
    input.addEventListener('input', function() {
      checkAndHighlightAlert(this);
      // Only show recommendations if the div exists
      if (document.getElementById('recommendations')) {
        showRecommendations();
      }
    });
    input.addEventListener('change', function() {
      checkAndHighlightAlert(this);
      // Only show recommendations if the div exists
      if (document.getElementById('recommendations')) {
        showRecommendations();
      }
    });
  });
}

// Show clinical recommendations based on alert values
export function showRecommendations() {
  const recommendationsDiv = document.getElementById('recommendations');
  if (!recommendationsDiv) {
    console.log('Recommendations div not found yet');
    return;
  }
  
  const activeAlerts = new Set();
  
  // Check all form elements for alert values
  const allInputs = document.querySelectorAll('input, select');
  allInputs.forEach(input => {
    if (input.value && input.value.trim() !== '') {
      const fieldName = input.name;
      const value = input.value;
      
      // Check if this value should trigger an alert
      let shouldAlert = false;
      let alertReason = '';
      
      // Check against WHO LCG alert values
      if (fieldName.includes('FHR') || fieldName.includes('Baseline_FHR')) {
        const fhr = parseInt(value);
        if (fhr < 110 || fhr > 160) {
          shouldAlert = true;
          alertReason = `FHR ${fhr} is outside normal range (110-160)`;
        }
      } else if (fieldName.includes('Pulse')) {
        const pulse = parseInt(value);
        if (pulse < 60 || pulse > 120) {
          shouldAlert = true;
          alertReason = `Pulse ${pulse} is outside normal range (60-120)`;
        }
      } else if (fieldName.includes('Systolic_BP')) {
        const bp = parseInt(value);
        if (bp < 90 || bp > 140) {
          shouldAlert = true;
          alertReason = `Systolic BP ${bp} is outside normal range (90-140)`;
        }
      } else if (fieldName.includes('Diastolic_BP')) {
        const bp = parseInt(value);
        if (bp > 90) {
          shouldAlert = true;
          alertReason = `Diastolic BP ${bp} is above normal range (>90)`;
        }
      } else if (fieldName.includes('Temperature')) {
        const temp = parseFloat(value);
        if (temp < 36 || temp > 37.5) {
          shouldAlert = true;
          alertReason = `Temperature ${temp}°C is outside normal range (36-37.5)`;
        }
      } else if (fieldName.includes('Pain_Relief') && value === 'N') {
        shouldAlert = true;
        alertReason = 'No pain relief provided';
      } else if (fieldName.includes('Oral_fluids') && value === 'N') {
        shouldAlert = true;
        alertReason = 'No oral fluids provided';
      } else if (fieldName.includes('Mobility') && value === 'N') {
        shouldAlert = true;
        alertReason = 'No mobility encouraged';
      }
      
      if (shouldAlert) {
        // Extract field name for display
        const displayName = fieldName.split('_').slice(0, -2).join(' ').replace(/_/g, ' ');
        activeAlerts.add(`${displayName}: ${alertReason}`);
      }
    }
  });
  
  // Generate recommendations HTML
  if (activeAlerts.size > 0) {
    let recommendationsHTML = '<div class="alert alert-warning"><strong>⚠️ Active Alerts:</strong><ul>';
    activeAlerts.forEach(alert => {
      recommendationsHTML += `<li>${alert}</li>`;
    });
    recommendationsHTML += '</ul></div>';
    
    // Add clinical recommendations
    recommendationsHTML += '<div class="alert alert-info"><strong>🏥 Clinical Recommendations:</strong><ul>';
    activeAlerts.forEach(alert => {
      const [field, reason] = alert.split(': ');
      
      // Provide specific recommendations based on field type
      let recommendation = '';
      if (field.includes('FHR') || field.includes('Baseline')) {
        recommendation = 'Monitor fetal heart rate closely. Consider fetal assessment and continuous monitoring if pattern persists.';
      } else if (field.includes('Pulse')) {
        recommendation = 'Monitor maternal pulse. Check for underlying causes and consider cardiovascular assessment.';
      } else if (field.includes('BP')) {
        recommendation = 'Monitor blood pressure closely. Consider antihypertensive therapy if severe hypertension.';
      } else if (field.includes('Temperature')) {
        recommendation = 'Monitor for signs of infection. Consider antibiotics if infection suspected.';
      } else if (field.includes('Pain') || field.includes('Mobility') || field.includes('Oral')) {
        recommendation = 'Review supportive care measures. Ensure adequate pain relief, mobility, and hydration.';
      } else {
        recommendation = 'Monitor and document progress. Consider specialist consultation if needed.';
      }
      
      recommendationsHTML += `<li><strong>${field}:</strong> ${recommendation}</li>`;
    });
    recommendationsHTML += '</ul></div>';
    
    recommendationsDiv.innerHTML = recommendationsHTML;
  } else {
    recommendationsDiv.innerHTML = '<div class="alert alert-success">✅ No active alerts. All parameters within normal ranges.</div>';
  }
}

// Get latest value for a field
export function getLatestValue(field) {
  // Go through timeCols in reverse to find the latest non-empty value
  for (let i = timeCols.length - 1; i >= 0; i--) {
    const key = `${timeCols[i]}_${field.replace(/\s+/g, "_")}`;
    const el = document.getElementsByName(key)[0];
    if (el && el.value) return el.value;
  }
  return "";
}

// Generate time columns starting from 00:30
export function generateTimeColumns() {
  const timeCols = [];
  for (let hour = 0; hour <= 15; hour++) {
    for (let minute = 0; minute < 60; minute += 30) {
      if (hour === 0 && minute === 0) continue; // Skip 00:00
      const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
      timeCols.push(timeStr);
    }
  }
  return timeCols;
}

// Test if sticky positioning is supported
export function testStickySupport() {
  const testElement = document.createElement('div');
  testElement.style.position = 'sticky';
  testElement.style.top = '0';
  
  if (testElement.style.position === 'sticky') {
    console.log('✅ Sticky positioning is supported');
  } else {
    console.log('❌ Sticky positioning is NOT supported - using fallback');
    // Add fallback CSS class
    document.body.classList.add('no-sticky-support');
  }
}

// Toggle patient information section
export function togglePatientInfo() {
  const patientForm = document.getElementById('patientForm');
  const toggleIcon = document.getElementById('toggleIcon');
  
  if (patientForm.style.display === 'none') {
    patientForm.style.display = 'block';
    toggleIcon.className = 'fas fa-chevron-down';
  } else {
    patientForm.style.display = 'none';
    toggleIcon.className = 'fas fa-chevron-right';
  }
}

// Toggle section visibility
export function toggleSection(sectionId) {
  const section = document.getElementById(sectionId);
  if (!section) {
    console.log('Section not found:', sectionId);
    return;
  }
  
  const tableWrappers = section.querySelectorAll('.table-wrapper');
  const toggleIcon = section.querySelector('.toggle-icon i');
  
  if (!tableWrappers || tableWrappers.length === 0 || !toggleIcon) {
    console.log('Table wrappers or toggle icon not found in section:', sectionId);
    return;
  }
  
  // Check if any table wrapper is visible
  const isVisible = Array.from(tableWrappers).some(wrapper => 
    wrapper.style.display !== 'none' && wrapper.style.display !== ''
  );
  
  // Toggle all table wrappers
  tableWrappers.forEach(wrapper => {
    if (isVisible) {
      wrapper.style.display = 'none';
    } else {
      wrapper.style.display = 'block';
    }
  });
  
  // Update toggle icon
  if (isVisible) {
    toggleIcon.className = 'fas fa-chevron-right';
  } else {
    toggleIcon.className = 'fas fa-chevron-down';
  }
}

// Initialize all sections as folded
export function initializeFoldedSections() {
  // Start with Patient Information folded
  document.getElementById('patientForm').style.display = 'none';
  document.getElementById('toggleIcon').className = 'fas fa-chevron-right';
  
  // Start with all section tables folded
  const sections = ['supportiveCareSection', 'babySection', 'womanSection', 'labourProgressSection', 'medicationSection', 'decisionMakingSection', 'initialsSection'];
  sections.forEach(sectionId => {
    const section = document.getElementById(sectionId);
    if (section) {
      const tableWrappers = section.querySelectorAll('.table-wrapper');
      const toggleIcon = section.querySelector('.toggle-icon i');
      
      if (tableWrappers && tableWrappers.length > 0 && toggleIcon) {
        tableWrappers.forEach(wrapper => {
          wrapper.style.display = 'none';
        });
        toggleIcon.className = 'fas fa-chevron-right';
      }
    }
  });
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

// Show save success message
export function showSaveSuccess() {
  const successMessage = document.getElementById('successMessage');
  if (successMessage) {
    successMessage.style.display = 'flex';
    successMessage.style.zIndex = '9999';
    console.log('Success message displayed');
    
    setTimeout(() => {
      successMessage.style.display = 'none';
    }, 3000);
  } else {
    console.error('Success message element not found');
  }
}

// Show save error message
export function showSaveError(errorMessage) {
  const successMessage = document.getElementById('successMessage');
  if (successMessage) {
    successMessage.innerHTML = '<i class="fas fa-exclamation-triangle"></i><span>Save Error: ' + errorMessage + '</span>';
    successMessage.className = 'success-message error-message';
    successMessage.style.display = 'flex';
    successMessage.style.zIndex = '9999';
    
    setTimeout(() => {
      successMessage.style.display = 'none';
      successMessage.innerHTML = '<i class="fas fa-check-circle"></i><span>Saved Successfully</span>';
      successMessage.className = 'success-message';
    }, 5000);
    
    console.error("Save error:", errorMessage);
  } else {
    console.error('Success message element not found');
  }
}

// Show starting time requirement message
export function showStartingTimeRequirement() {
  const requirementDiv = document.getElementById('startingTimeRequirement');
  if (requirementDiv) {
    requirementDiv.style.display = 'block';
  }
}

// Hide all tables
export function hideAllTables() {
  const sections = ['supportiveCareSection', 'babySection', 'womanSection', 'labourProgressSection', 'medicationSection', 'decisionMakingSection', 'initialsSection'];
  sections.forEach(sectionId => {
    const section = document.getElementById(sectionId);
    if (section) {
      section.style.display = 'none';
    }
  });
}

// Show all tables
export function showAllTables() {
  const sections = ['supportiveCareSection', 'babySection', 'womanSection', 'labourProgressSection', 'medicationSection', 'decisionMakingSection', 'initialsSection'];
  sections.forEach(sectionId => {
    const section = document.getElementById(sectionId);
    if (section) {
      section.style.display = 'block';
    }
  });
}
