/**
 * Clinical Data Validation
 * Validates clinical data for consistency and integrity
 */

/**
 * Validate EDD (Expected Due Date) and LMP (Last Menstrual Period) consistency
 * @param {string|Date} lmp - Last Menstrual Period date
 * @param {string|Date} edd - Expected Due Date
 * @returns {object} {isValid: boolean, error: string|null}
 */
function validateEDDLMP(lmp, edd) {
  if (!lmp && !edd) {
    return { isValid: true, error: null }; // Both optional
  }
  
  try {
    const lmpDate = lmp ? new Date(lmp) : null;
    const eddDate = edd ? new Date(edd) : null;
    
    // If only one is provided, that's okay (we can calculate the other)
    if (!lmpDate && eddDate) {
      return { isValid: true, error: null };
    }
    if (lmpDate && !eddDate) {
      return { isValid: true, error: null };
    }
    
    if (!lmpDate || !eddDate) {
      return { isValid: true, error: null };
    }
    
    // EDD should be approximately 280 days (40 weeks) after LMP
    const daysDifference = Math.floor((eddDate - lmpDate) / (1000 * 60 * 60 * 24));
    const expectedDays = 280;
    const tolerance = 14; // Allow 2 weeks tolerance
    
    if (daysDifference < expectedDays - tolerance || daysDifference > expectedDays + tolerance) {
      return {
        isValid: false,
        error: `EDD and LMP dates are inconsistent. Expected ~280 days between LMP and EDD, but found ${daysDifference} days.`
      };
    }
    
    return { isValid: true, error: null };
  } catch (error) {
    return {
      isValid: false,
      error: `Error validating EDD/LMP: ${error.message}`
    };
  }
}

/**
 * Validate gestational age
 * @param {number} gestationalAge - Gestational age in weeks
 * @param {string|Date} lmp - Last Menstrual Period date
 * @param {string|Date} currentDate - Current date (defaults to today)
 * @returns {object} {isValid: boolean, error: string|null}
 */
function validateGestationalAge(gestationalAge, lmp, currentDate = new Date()) {
  if (!gestationalAge || isNaN(gestationalAge)) {
    return { isValid: true, error: null }; // Optional field
  }
  
  if (gestationalAge < 0) {
    return {
      isValid: false,
      error: 'Gestational age cannot be negative.'
    };
  }
  
  if (gestationalAge > 45) {
    return {
      isValid: false,
      error: 'Gestational age exceeds maximum (45 weeks). Please verify.'
    };
  }
  
  // If LMP is provided, validate against it
  if (lmp) {
    try {
      const lmpDate = new Date(lmp);
      const current = new Date(currentDate);
      const daysSinceLMP = Math.floor((current - lmpDate) / (1000 * 60 * 60 * 24));
      const weeksSinceLMP = daysSinceLMP / 7;
      
      // Allow 2 weeks tolerance
      if (Math.abs(gestationalAge - weeksSinceLMP) > 2) {
        return {
          isValid: false,
          error: `Gestational age (${gestationalAge} weeks) doesn't match LMP date. Expected approximately ${weeksSinceLMP.toFixed(1)} weeks.`
        };
      }
    } catch (error) {
      // If date parsing fails, skip LMP validation
      console.warn('Error validating gestational age against LMP:', error);
    }
  }
  
  return { isValid: true, error: null };
}

/**
 * Validate date is not in the future
 * @param {string|Date} date - Date to validate
 * @param {string} fieldName - Name of the field (for error message)
 * @returns {object} {isValid: boolean, error: string|null}
 */
function validateNotFuture(date, fieldName = 'Date') {
  if (!date) {
    return { isValid: true, error: null }; // Optional field
  }
  
  try {
    const dateObj = new Date(date);
    const today = new Date();
    today.setHours(23, 59, 59, 999); // End of today
    
    if (dateObj > today) {
      return {
        isValid: false,
        error: `${fieldName} cannot be in the future.`
      };
    }
    
    return { isValid: true, error: null };
  } catch (error) {
    return {
      isValid: false,
      error: `Invalid date format for ${fieldName}.`
    };
  }
}

/**
 * Validate date is not too far in the past (e.g., more than 1 year for registration)
 * @param {string|Date} date - Date to validate
 * @param {string} fieldName - Name of the field
 * @param {number} maxYearsPast - Maximum years in the past (default: 1)
 * @returns {object} {isValid: boolean, error: string|null}
 */
function validateNotTooOld(date, fieldName = 'Date', maxYearsPast = 1) {
  if (!date) {
    return { isValid: true, error: null };
  }
  
  try {
    const dateObj = new Date(date);
    const today = new Date();
    const maxPastDate = new Date(today);
    maxPastDate.setFullYear(today.getFullYear() - maxYearsPast);
    
    if (dateObj < maxPastDate) {
      return {
        isValid: false,
        error: `${fieldName} is more than ${maxYearsPast} year(s) in the past. Please verify.`
      };
    }
    
    return { isValid: true, error: null };
  } catch (error) {
    return {
      isValid: false,
      error: `Invalid date format for ${fieldName}.`
    };
  }
}

/**
 * Validate patient age consistency
 * @param {number} age - Patient age
 * @param {string|Date} dateOfBirth - Date of birth
 * @param {string|Date} registrationDate - Registration date
 * @returns {object} {isValid: boolean, error: string|null}
 */
function validateAgeConsistency(age, dateOfBirth, registrationDate = new Date()) {
  if (!age && !dateOfBirth) {
    return { isValid: true, error: null }; // Both optional
  }
  
  if (age && dateOfBirth) {
    try {
      const dob = new Date(dateOfBirth);
      const regDate = new Date(registrationDate);
      const calculatedAge = Math.floor((regDate - dob) / (1000 * 60 * 60 * 24 * 365.25));
      
      // Allow 1 year tolerance
      if (Math.abs(age - calculatedAge) > 1) {
        return {
          isValid: false,
          error: `Age (${age} years) doesn't match date of birth. Calculated age: ${calculatedAge} years.`
        };
      }
    } catch (error) {
      return {
        isValid: false,
        error: `Error validating age consistency: ${error.message}`
      };
    }
  }
  
  return { isValid: true, error: null };
}

/**
 * Validate newborn details relative to registration
 * @param {string|Date} registrationDate - Patient registration date
 * @param {string|Date} birthDate - Newborn birth date
 * @param {number} gestationalAgeAtBirth - Gestational age at birth (weeks)
 * @returns {object} {isValid: boolean, error: string|null}
 */
function validateNewbornTimeline(registrationDate, birthDate, gestationalAgeAtBirth) {
  if (!registrationDate || !birthDate) {
    return { isValid: true, error: null }; // Both required for validation
  }
  
  try {
    const regDate = new Date(registrationDate);
    const birth = new Date(birthDate);
    
    // Birth date should be after registration (patient registered before birth)
    if (birth < regDate) {
      return {
        isValid: false,
        error: 'Birth date cannot be before patient registration date.'
      };
    }
    
    // If gestational age is provided, validate timeline
    if (gestationalAgeAtBirth && !isNaN(gestationalAgeAtBirth)) {
      const daysBetween = Math.floor((birth - regDate) / (1000 * 60 * 60 * 24));
      const weeksBetween = daysBetween / 7;
      
      // If patient was registered during pregnancy, gestational age at registration
      // plus time between registration and birth should approximately equal gestational age at birth
      // We'll allow some tolerance
      if (weeksBetween > gestationalAgeAtBirth + 2) {
        return {
          isValid: false,
          error: `Timeline inconsistency: ${weeksBetween.toFixed(1)} weeks between registration and birth, but gestational age at birth is ${gestationalAgeAtBirth} weeks.`
        };
      }
    }
    
    return { isValid: true, error: null };
  } catch (error) {
    return {
      isValid: false,
      error: `Error validating newborn timeline: ${error.message}`
    };
  }
}

/**
 * Validate date sequence (e.g., visit dates should be in chronological order)
 * @param {Array<{date: string|Date, label: string}>} dates - Array of date objects with labels
 * @returns {object} {isValid: boolean, error: string|null}
 */
function validateDateSequence(dates) {
  if (!dates || dates.length < 2) {
    return { isValid: true, error: null };
  }
  
  try {
    const sortedDates = [...dates]
      .map(d => ({ ...d, dateObj: new Date(d.date) }))
      .filter(d => !isNaN(d.dateObj.getTime()))
      .sort((a, b) => a.dateObj - b.dateObj);
    
    // Check if dates are in expected order
    for (let i = 1; i < sortedDates.length; i++) {
      if (sortedDates[i].dateObj < sortedDates[i - 1].dateObj) {
        return {
          isValid: false,
          error: `Date sequence error: ${sortedDates[i].label} (${sortedDates[i].date}) is before ${sortedDates[i - 1].label} (${sortedDates[i - 1].date}).`
        };
      }
    }
    
    return { isValid: true, error: null };
  } catch (error) {
    return {
      isValid: false,
      error: `Error validating date sequence: ${error.message}`
    };
  }
}

/**
 * Validate patient registration data
 * @param {object} patientData - Patient registration data
 * @returns {object} {isValid: boolean, errors: Array<string>, warnings: Array<string>}
 */
function validatePatientRegistration(patientData) {
  const errors = [];
  const warnings = [];
  
  // Validate registration date is not in future
  if (patientData.registration_date) {
    const regDateCheck = validateNotFuture(patientData.registration_date, 'Registration date');
    if (!regDateCheck.isValid) {
      errors.push(regDateCheck.error);
    }
  }
  
  // Validate age consistency
  if (patientData.age && patientData.date_of_birth) {
    const ageCheck = validateAgeConsistency(
      parseInt(patientData.age),
      patientData.date_of_birth,
      patientData.registration_date
    );
    if (!ageCheck.isValid) {
      errors.push(ageCheck.error);
    }
  }
  
  // Validate EDD/LMP if both provided
  if (patientData.lmp && patientData.edd) {
    const eddLmpCheck = validateEDDLMP(patientData.lmp, patientData.edd);
    if (!eddLmpCheck.isValid) {
      errors.push(eddLmpCheck.error);
    }
  }
  
  // Validate gestational age if provided
  if (patientData.gestational_age && patientData.lmp) {
    const gaCheck = validateGestationalAge(
      parseFloat(patientData.gestational_age),
      patientData.lmp
    );
    if (!gaCheck.isValid) {
      errors.push(gaCheck.error);
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors: errors,
    warnings: warnings
  };
}

/**
 * Show validation error to user
 * @param {Array<string>} errors - Array of error messages
 * @param {Function} onOverride - Callback when user chooses to override
 */
function showValidationError(errors, onOverride) {
  const errorMessage = errors.join('\n');
  
  const userChoice = confirm(
    `Validation Errors Found:\n\n${errorMessage}\n\n` +
    'Do you want to continue anyway? (Click OK to override, Cancel to go back and fix)'
  );
  
  if (userChoice && onOverride) {
    const justification = prompt('Please provide a reason for overriding validation (required):');
    if (justification && justification.trim() !== '') {
      onOverride(justification);
    } else {
      alert('Justification is required to override validation.');
    }
  }
  
  return userChoice;
}

// Export functions
window.ClinicalValidator = {
  validateEDDLMP: validateEDDLMP,
  validateGestationalAge: validateGestationalAge,
  validateNotFuture: validateNotFuture,
  validateNotTooOld: validateNotTooOld,
  validateAgeConsistency: validateAgeConsistency,
  validateNewbornTimeline: validateNewbornTimeline,
  validateDateSequence: validateDateSequence,
  validatePatientRegistration: validatePatientRegistration,
  showError: showValidationError
};

console.log('✅ Clinical Validator initialized');
