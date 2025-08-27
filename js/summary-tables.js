// ============================================================================
// TABLE GENERATION FUNCTIONS
// ============================================================================
// This file contains all table generation functions with dynamic time columns

import { sections, dropdownOptions, whoAlertValues } from './summary-data.js';
import { generateTimeColumnsForTable, isSecondStageTime } from './summary-time-locking.js';

// Generate Supportive Care table
export function generateSupportiveCareTable() {
  const table = document.getElementById("supportiveCareTable");
  if (!table) return;
  
  const isSecondStage = secondStageStartTime !== null;
  const timeColumns = generateTimeColumnsForTable('supportive', isSecondStage);
  
  let tableHTML = `
    <div class="table-container">
      <table class="lcg-table">
        <thead>
          <tr>
            <th class="field-column">Field</th>
            <th class="alert-column">Alert</th>
            ${timeColumns.map(time => `<th class="time-column ${isSecondStageTime(time) ? 'second-stage' : ''}">${time}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
  `;
  
  sections["Supportive Care"].forEach(field => {
    const fieldKey = field.replace(/\s+/g, "_");
    const alertValue = whoAlertValues[field] || "";
    const options = dropdownOptions[field] || [];
    
    tableHTML += `
      <tr>
        <td class="field-column">${field}</td>
        <td class="alert-column">${alertValue}</td>
    `;
    
    timeColumns.forEach(time => {
      const timeKey = time.replace(':', '_');
      const key = `${fieldKey}_${timeKey}`;
      const value = existing[key] || '';
      
      tableHTML += `
        <td class="data-cell ${isSecondStageTime(time) ? 'second-stage' : ''}">
          <select name="${key}" class="form-control">
            <option value="">Select</option>
            ${options.map(option => `<option value="${option}" ${value === option ? 'selected' : ''}>${option}</option>`).join('')}
          </select>
        </td>
      `;
    });
    
    tableHTML += '</tr>';
  });
  
  tableHTML += `
        </tbody>
      </table>
    </div>
  `;
  
  table.innerHTML = tableHTML;
}

// Generate FHR table (separate from Baby table)
export function generateFHRTable() {
  const table = document.getElementById("fhrTable");
  if (!table) return;
  
  const isSecondStage = secondStageStartTime !== null;
  const timeColumns = generateTimeColumnsForTable('fhr', isSecondStage);
  
  let tableHTML = `
    <div class="table-container">
      <table class="lcg-table">
        <thead>
          <tr>
            <th class="field-column">Field</th>
            <th class="alert-column">Alert</th>
            ${timeColumns.map(time => `<th class="time-column ${isSecondStageTime(time) ? 'second-stage' : ''}">${time}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
  `;
  
  // Baseline FHR - number input
  tableHTML += `
    <tr>
      <td class="field-column">Baseline FHR</td>
      <td class="alert-column">110-160</td>
  `;
  
  timeColumns.forEach(time => {
    const timeKey = time.replace(':', '_');
    const key = `Baseline_FHR_${timeKey}`;
    const value = existing[key] || '';
    
    tableHTML += `<td class="data-cell ${isSecondStageTime(time) ? 'second-stage' : ''}"><input type="number" name="${key}" value="${value}" class="form-control" min="60" max="200"></td>`;
  });
  
  tableHTML += '</tr>';
  
  // FHR deceleration - dropdown
  const fhrDecelOptions = dropdownOptions["FHR deceleration"] || [];
  tableHTML += `
    <tr>
      <td class="field-column">FHR deceleration</td>
      <td class="alert-column">${whoAlertValues["FHR deceleration"] || ""}</td>
  `;
  
  timeColumns.forEach(time => {
    const timeKey = time.replace(':', '_');
    const key = `FHR_deceleration_${timeKey}`;
    const value = existing[key] || '';
    
    tableHTML += `
      <td class="data-cell ${isSecondStageTime(time) ? 'second-stage' : ''}">
        <select name="${key}" class="form-control">
          <option value="">Select</option>
          ${fhrDecelOptions.map(option => `<option value="${option}" ${value === option ? 'selected' : ''}>${option}</option>`).join('')}
        </select>
      </td>
    `;
  });
  
  tableHTML += '</tr>';
  
  tableHTML += `
        </tbody>
      </table>
    </div>
  `;
  
  table.innerHTML = tableHTML;
}

// Generate Baby table (separate from FHR table)
export function generateBabyTable() {
  const table = document.getElementById("babyTable");
  if (!table) return;
  
  const isSecondStage = secondStageStartTime !== null;
  const timeColumns = generateTimeColumnsForTable('baby', isSecondStage);
  
  let tableHTML = `
    <div class="table-container">
      <table class="lcg-table">
        <thead>
          <tr>
            <th class="field-column">Field</th>
            <th class="alert-column">Alert</th>
            ${timeColumns.map(time => `<th class="time-column ${isSecondStageTime(time) ? 'second-stage' : ''}">${time}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
  `;
  
  // Baby fields - dropdowns
  const babyFields = ["Amniotic fluid", "Fetal position", "Caput", "Moulding"];
  babyFields.forEach(field => {
    const fieldKey = field.replace(/\s+/g, "_");
    const alertValue = whoAlertValues[field] || "";
    const options = dropdownOptions[field] || [];
    
    tableHTML += `
      <tr>
        <td class="field-column">${field}</td>
        <td class="alert-column">${alertValue}</td>
    `;
    
    timeColumns.forEach(time => {
      const timeKey = time.replace(':', '_');
      const key = `${fieldKey}_${timeKey}`;
      const value = existing[key] || '';
      
      tableHTML += `
        <td class="data-cell ${isSecondStageTime(time) ? 'second-stage' : ''}">
          <select name="${key}" class="form-control">
            <option value="">Select</option>
            ${options.map(option => `<option value="${option}" ${value === option ? 'selected' : ''}>${option}</option>`).join('')}
          </select>
        </td>
      `;
    });
    
    tableHTML += '</tr>';
  });
  
  tableHTML += `
        </tbody>
      </table>
    </div>
  `;
  
  table.innerHTML = tableHTML;
}

// Generate Woman table
export function generateWomanTable() {
  const table = document.getElementById("womanTable");
  if (!table) return;
  
  const isSecondStage = secondStageStartTime !== null;
  const timeColumns = generateTimeColumnsForTable('woman', isSecondStage);
  
  let tableHTML = `
    <div class="table-container">
      <table class="lcg-table">
        <thead>
          <tr>
            <th class="field-column">Field</th>
            <th class="alert-column">Alert</th>
            ${timeColumns.map(time => `<th class="time-column ${isSecondStageTime(time) ? 'second-stage' : ''}">${time}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
  `;
  
  sections["Woman"].forEach(field => {
    const fieldKey = field.replace(/\s+/g, "_");
    const alertValue = whoAlertValues[field] || "";
    
    tableHTML += `
      <tr>
        <td class="field-column">${field}</td>
        <td class="alert-column">${alertValue}</td>
    `;
    
    timeColumns.forEach(time => {
      const timeKey = time.replace(':', '_');
      const key = `${fieldKey}_${timeKey}`;
      const value = existing[key] || '';
      
      tableHTML += `<td class="data-cell ${isSecondStageTime(time) ? 'second-stage' : ''}"><input type="text" name="${key}" value="${value}" class="form-control"></td>`;
    });
    
    tableHTML += '</tr>';
  });
  
  tableHTML += `
        </tbody>
      </table>
    </div>
  `;
  
  table.innerHTML = tableHTML;
}

// Generate Contractions table (separate from Labour Progress)
export function generateContractionsTable() {
  const table = document.getElementById("contractionsTable");
  if (!table) return;
  
  const isSecondStage = secondStageStartTime !== null;
  const timeColumns = generateTimeColumnsForTable('contractions', isSecondStage);
  
  let tableHTML = `
    <div class="table-container">
      <table class="lcg-table">
        <thead>
          <tr>
            <th class="field-column">Field</th>
            <th class="alert-column">Alert</th>
            ${timeColumns.map(time => `<th class="time-column ${isSecondStageTime(time) ? 'second-stage' : ''}">${time}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
  `;
  
  const contractionFields = ["Contractions per 10 min", "Duration of contractions"];
  contractionFields.forEach(field => {
    const fieldKey = field.replace(/\s+/g, "_");
    const alertValue = whoAlertValues[field] || "";
    
    tableHTML += `
      <tr>
        <td class="field-column">${field}</td>
        <td class="alert-column">${alertValue}</td>
    `;
    
    timeColumns.forEach(time => {
      const timeKey = time.replace(':', '_');
      const key = `${fieldKey}_${timeKey}`;
      const value = existing[key] || '';
      
      tableHTML += `<td class="data-cell ${isSecondStageTime(time) ? 'second-stage' : ''}"><input type="number" name="${key}" value="${value}" class="form-control"></td>`;
    });
    
    tableHTML += '</tr>';
  });
  
  tableHTML += `
        </tbody>
      </table>
    </div>
  `;
  
  table.innerHTML = tableHTML;
}

// Generate Medication table
export function generateMedicationTable() {
  const table = document.getElementById("medicationTable");
  if (!table) return;
  
  const isSecondStage = secondStageStartTime !== null;
  const timeColumns = generateTimeColumnsForTable('medication', isSecondStage);
  
  let tableHTML = `
    <div class="table-container">
      <table class="lcg-table">
        <thead>
          <tr>
            <th class="field-column">Field</th>
            <th class="alert-column">Alert</th>
            ${timeColumns.map(time => `<th class="time-column ${isSecondStageTime(time) ? 'second-stage' : ''}">${time}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
  `;
  
  const medicationFields = ["Oxytocin (U/L, drops/min)", "Medicine", "IV fluids"];
  medicationFields.forEach(field => {
    const fieldKey = field.replace(/\s+/g, "_");
    const options = dropdownOptions[field] || [];
    
    tableHTML += `
      <tr>
        <td class="field-column">${field}</td>
        <td class="alert-column">-</td>
    `;
    
    timeColumns.forEach(time => {
      const timeKey = time.replace(':', '_');
      const key = `Medication_${fieldKey}_${timeKey}`;
      const value = existing[key] || '';
      
      tableHTML += `
        <td class="data-cell ${isSecondStageTime(time) ? 'second-stage' : ''}">
          <select name="${key}" class="form-control">
            <option value="">Select</option>
            ${options.map(option => `<option value="${option}" ${value === option ? 'selected' : ''}>${option}</option>`).join('')}
          </select>
        </td>
      `;
    });
    
    tableHTML += '</tr>';
  });
  
  tableHTML += `
        </tbody>
      </table>
    </div>
  `;
  
  table.innerHTML = tableHTML;
}

// Generate Shared Decision Making table
export function generateSharedDecisionTable() {
  const table = document.getElementById("decisionMakingTable");
  if (!table) return;
  
  const isSecondStage = secondStageStartTime !== null;
  const timeColumns = generateTimeColumnsForTable('decision', isSecondStage);
  
  let tableHTML = `
    <div class="table-container">
      <table class="lcg-table">
        <thead>
          <tr>
            <th class="field-column">Field</th>
            <th class="alert-column">Alert</th>
            ${timeColumns.map(time => `<th class="time-column ${isSecondStageTime(time) ? 'second-stage' : ''}">${time}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
  `;
  
  // Assessment fields
  const assessmentFields = ["Pain", "Progress", "Maternal", "Fetal"];
  assessmentFields.forEach(field => {
    const fieldKey = field.replace(/\s+/g, "_");
    
    tableHTML += `
      <tr>
        <td class="field-column">ASSESSMENT - ${field}</td>
        <td class="alert-column">-</td>
    `;
    
    timeColumns.forEach(time => {
      const timeKey = time.replace(':', '_');
      const key = `ASSESSMENT_${fieldKey}_${timeKey}`;
      const value = existing[key] || '';
      
      tableHTML += `<td class="data-cell ${isSecondStageTime(time) ? 'second-stage' : ''}"><input type="text" name="${key}" value="${value}" class="form-control" placeholder="Assessment"></td>`;
    });
    
    tableHTML += '</tr>';
  });
  
  // Plan field
  tableHTML += `
    <tr>
      <td class="field-column">PLAN</td>
      <td class="alert-column">-</td>
  `;
  
  timeColumns.forEach(time => {
    const timeKey = time.replace(':', '_');
    const key = `PLAN_${timeKey}`;
    const value = existing[key] || '';
    
    tableHTML += `<td class="data-cell ${isSecondStageTime(time) ? 'second-stage' : ''}"><input type="text" name="${key}" value="${value}" class="form-control" placeholder="Plan"></td>`;
  });
  
  tableHTML += '</tr>';
  
  tableHTML += `
        </tbody>
      </table>
    </div>
  `;
  
  table.innerHTML = tableHTML;
}

// Generate Initials table
export function generateInitialsTable() {
  const table = document.getElementById("initialsTable");
  if (!table) return;
  
  const isSecondStage = secondStageStartTime !== null;
  const timeColumns = generateTimeColumnsForTable('initials', isSecondStage);
  
  let tableHTML = `
    <div class="table-container">
      <table class="lcg-table">
        <thead>
          <tr>
            <th class="field-column">Field</th>
            <th class="alert-column">Alert</th>
            ${timeColumns.map(time => `<th class="time-column ${isSecondStageTime(time) ? 'second-stage' : ''}">${time}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td class="field-column">INITIALS</td>
            <td class="alert-column">-</td>
  `;
  
  timeColumns.forEach(time => {
    const timeKey = time.replace(':', '_');
    const key = `INITIALS_${timeKey}`;
    const value = existing[key] || '';
    
    tableHTML += `<td class="data-cell ${isSecondStageTime(time) ? 'second-stage' : ''}"><input type="text" name="${key}" value="${value}" class="form-control" placeholder="Initials"></td>`;
  });
  
  tableHTML += `
          </tr>
        </tbody>
      </table>
    </div>
  `;
  
  table.innerHTML = tableHTML;
}

// Generate all tables
export function generateAllTables() {
  console.log('🔄 Generating all tables...');
  
  generateSupportiveCareTable();
  generateFHRTable();
  generateBabyTable();
  generateWomanTable();
  generateContractionsTable();
  generateMedicationTable();
  generateSharedDecisionTable();
  generateInitialsTable();
  
  console.log('✅ All tables generated successfully');
}
