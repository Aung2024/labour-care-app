/**
 * Sensitive Data Masking
 * Masks sensitive identifiers (phone numbers, etc.) in list views
 * Provides toggle to show/hide sensitive data
 */

// Masking state
let isMaskingEnabled = false;

/**
 * Mask phone number
 * @param {string} phone - Phone number to mask
 * @param {boolean} showFull - If true, show full number (for detail views)
 * @returns {string} Masked phone number
 */
function maskPhoneNumber(phone, showFull = false) {
  if (!phone || phone.trim() === '') {
    return '-';
  }
  
  // If masking is disabled or showFull is true, return full number
  if (!isMaskingEnabled || showFull) {
    return phone;
  }
  
  // Normalize phone number (remove spaces, dashes)
  const normalized = phone.replace(/[^\d+]/g, '');
  
  // Mask: Show first 2 and last 3 digits, mask the rest
  // Example: 0912345678 -> 09 XXX XXX 678
  if (normalized.length >= 5) {
    const firstTwo = normalized.substring(0, 2);
    const lastThree = normalized.substring(normalized.length - 3);
    return `${firstTwo} XXX XXX ${lastThree}`;
  } else if (normalized.length >= 3) {
    const firstTwo = normalized.substring(0, 2);
    const lastOne = normalized.substring(normalized.length - 1);
    return `${firstTwo} XXX ${lastOne}`;
  } else {
    // Too short to mask meaningfully
    return 'XXX';
  }
}

/**
 * Mask patient name (partial masking for privacy)
 * @param {string} name - Patient name to mask
 * @param {boolean} showFull - If true, show full name (for detail views)
 * @returns {string} Masked name
 */
function maskPatientName(name, showFull = false) {
  if (!name || name.trim() === '') {
    return 'Unknown';
  }
  
  // If masking is disabled or showFull is true, return full name
  if (!isMaskingEnabled || showFull) {
    return name;
  }
  
  // Show first name and last initial, mask middle
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    // Single name - show first 2 characters, mask rest
    if (parts[0].length > 2) {
      return parts[0].substring(0, 2) + '***';
    }
    return parts[0];
  } else if (parts.length >= 2) {
    // Multiple names - show first name, mask middle, show last initial
    const firstName = parts[0];
    const lastName = parts[parts.length - 1];
    const lastInitial = lastName.length > 0 ? lastName[0] : '';
    return `${firstName} *** ${lastInitial}.`;
  }
  
  return name;
}

/**
 * Mask address (show only general area)
 * @param {string} address - Address to mask
 * @param {boolean} showFull - If true, show full address (for detail views)
 * @returns {string} Masked address
 */
function maskAddress(address, showFull = false) {
  if (!address || address.trim() === '') {
    return '-';
  }
  
  // If masking is disabled or showFull is true, return full address
  if (!isMaskingEnabled || showFull) {
    return address;
  }
  
  // Show only first part (usually village/ward), mask rest
  const parts = address.split(',').map(p => p.trim());
  if (parts.length > 0) {
    return parts[0] + ', ***';
  }
  
  return '***';
}

/**
 * Toggle masking on/off
 */
function toggleMasking() {
  isMaskingEnabled = !isMaskingEnabled;
  localStorage.setItem('dataMaskingEnabled', isMaskingEnabled.toString());
  
  // Re-render any displayed data
  if (typeof displayPatients === 'function') {
    displayPatients();
  }
  
  // Update toggle button if exists
  const toggleBtn = document.getElementById('maskingToggle');
  updateToggleButton(toggleBtn);
  
  console.log('Data masking:', isMaskingEnabled ? 'enabled' : 'disabled');
}

/**
 * Initialize masking state from localStorage
 */
function initMasking() {
  const saved = localStorage.getItem('dataMaskingEnabled');
  isMaskingEnabled = saved === 'true';
  console.log('Data masking initialized:', isMaskingEnabled ? 'enabled' : 'disabled');
}

/**
 * Create masking toggle button
 * @param {string} containerId - ID of container to add button to
 */
function createMaskingToggle(containerId) {
  const container = document.getElementById(containerId);
  if (!container) {
    console.warn('Container not found for masking toggle:', containerId);
    return;
  }
  
  // Check if toggle already exists
  if (document.getElementById('maskingToggle')) {
    return;
  }
  
  const toggleBtn = document.createElement('button');
  toggleBtn.id = 'maskingToggle';
  toggleBtn.className = 'btn btn-outline-secondary btn-sm';
  toggleBtn.style.cssText = 'display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 1rem; white-space: nowrap;';
  toggleBtn.onclick = toggleMasking;
  
  // Set initial state
  updateToggleButton(toggleBtn);
  
  // Append to container (not insertBefore, just append)
  container.appendChild(toggleBtn);
  
  console.log('✅ Masking toggle button created');
}

/**
 * Update toggle button appearance
 */
function updateToggleButton(btn) {
  if (!btn) return;
  
  if (isMaskingEnabled) {
    btn.innerHTML = '<i class="fas fa-eye-slash"></i> <span class="lang-text" data-en="Show Sensitive Data" data-mm="အချက်အလက်များ ပြရန်">Show Sensitive Data</span>';
    btn.classList.add('active');
  } else {
    btn.innerHTML = '<i class="fas fa-eye"></i> <span class="lang-text" data-en="Hide Sensitive Data" data-mm="အချက်အလက်များ ဖျောက်ရန်">Hide Sensitive Data</span>';
    btn.classList.remove('active');
  }
}

// Export functions
window.DataMasking = {
  maskPhone: maskPhoneNumber,
  maskName: maskPatientName,
  maskAddress: maskAddress,
  toggle: toggleMasking,
  isEnabled: () => isMaskingEnabled,
  init: initMasking,
  createToggle: createMaskingToggle
};

// Auto-initialize
initMasking();

console.log('✅ Data Masking initialized');

