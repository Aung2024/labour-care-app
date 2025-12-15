/**
 * Account Lockout Debugging Script
 * 
 * Copy and paste this into your browser console (F12) on the login page
 * to debug why account lockout is not working
 */

async function debugAccountLockout() {
  console.log('🔍 Starting Account Lockout Debug...\n');
  
  // Test 1: Check if scripts are loaded
  console.log('📦 Test 1: Checking if scripts are loaded...');
  console.log('  PasswordPolicy:', typeof PasswordPolicy);
  console.log('  AuditLogger:', typeof AuditLogger);
  console.log('  Firebase:', typeof firebase);
  
  if (typeof PasswordPolicy === 'undefined') {
    console.error('❌ PasswordPolicy is not loaded! Check Network tab for js/password-policy.js');
    return;
  }
  
  if (typeof firebase === 'undefined') {
    console.error('❌ Firebase is not loaded! Check Network tab for firebase.js');
    return;
  }
  
  console.log('✅ All scripts loaded\n');
  
  // Test 2: Check if functions exist
  console.log('🔧 Test 2: Checking if functions exist...');
  console.log('  recordFailedAttempt:', typeof PasswordPolicy.recordFailedAttempt);
  console.log('  checkLockout:', typeof PasswordPolicy.checkLockout);
  
  if (typeof PasswordPolicy.recordFailedAttempt !== 'function') {
    console.error('❌ recordFailedAttempt function not found!');
    return;
  }
  
  console.log('✅ All functions exist\n');
  
  // Test 3: Test with a test email
  const testEmail = prompt('Enter an email to test with (or use test@example.com):') || 'test@example.com';
  console.log('🧪 Test 3: Testing with email:', testEmail);
  
  try {
    // Test checkLockout
    console.log('  Checking current lockout status...');
    const currentStatus = await PasswordPolicy.checkLockout(testEmail);
    console.log('  Current status:', currentStatus);
    
    // Test recordFailedAttempt
    console.log('  Recording failed attempt...');
    const lockoutStatus = await PasswordPolicy.recordFailedAttempt(testEmail);
    console.log('  Lockout status after attempt:', lockoutStatus);
    
    // Check Firestore directly
    console.log('  Checking Firestore directly...');
    const lockoutDoc = await firebase.firestore()
      .collection('account_lockouts')
      .doc(testEmail)
      .get();
    
    if (lockoutDoc.exists) {
      console.log('  ✅ Document exists in Firestore:', lockoutDoc.data());
    } else {
      console.error('  ❌ Document does NOT exist in Firestore!');
      console.log('  This means Firestore write failed. Check:');
      console.log('    1. Firestore rules are deployed');
      console.log('    2. You are authenticated');
      console.log('    3. Browser console for errors');
    }
    
    // Test 5 times to trigger lockout
    console.log('\n🔄 Test 4: Simulating 5 failed attempts...');
    for (let i = 1; i <= 5; i++) {
      const status = await PasswordPolicy.recordFailedAttempt(testEmail);
      console.log(`  Attempt ${i}:`, {
        attempts: status.attempts,
        isLocked: status.isLocked,
        remainingTime: status.remainingTime
      });
      
      if (status.isLocked) {
        console.log(`  ✅ Account locked after ${i} attempts!`);
        break;
      }
    }
    
    // Final check
    const finalStatus = await PasswordPolicy.checkLockout(testEmail);
    console.log('\n📊 Final Status:', finalStatus);
    
    if (finalStatus.isLocked) {
      console.log('✅ Account lockout is working!');
      console.log(`   Locked until: ${finalStatus.unlockTime}`);
      console.log(`   Remaining time: ${finalStatus.remainingTime} minutes`);
    } else {
      console.error('❌ Account lockout is NOT working!');
      console.log('   Check Firestore rules and browser console for errors');
    }
    
  } catch (error) {
    console.error('❌ Error during testing:', error);
    console.error('   Error details:', {
      code: error.code,
      message: error.message,
      stack: error.stack
    });
    
    if (error.code === 'permission-denied') {
      console.error('   🔒 PERMISSION DENIED - Check Firestore rules!');
      console.error('   Make sure account_lockouts collection rules allow writes');
    }
  }
  
  console.log('\n✅ Debug complete!');
}

// Run the debug function
debugAccountLockout();

