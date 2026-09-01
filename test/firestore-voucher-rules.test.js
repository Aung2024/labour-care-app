'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds
} = require('@firebase/rules-unit-testing');
const {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} = require('firebase/firestore');

const PROJECT_ID = 'demo-labourcare-2481a-vouchers';
const SHEET_ID = 'AAAAAAAAAAAAAAAAAAAAAA';
const VOUCHER_ID = 'K7MP-3QWX';
let env;

async function seed() {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, 'users/po'), { role: 'Program Officer', active: true, approved: true, displayName: 'PO' }),
      setDoc(doc(db, 'users/mw'), { role: 'Midwife', active: true, approved: true, name: 'Maternity Home' }),
      setDoc(doc(db, 'users/hla'), { role: 'Midwife', approved: true, name: 'Midwife Hla Hla' }),
      setDoc(doc(db, 'users/legacy-mw'), { active: true, approved: true, provider_type: 'midwife', name: 'Legacy Midwife' }),
      setDoc(doc(db, 'users/lab1'), { role: 'Lab', active: true, approved: true, displayName: 'Lab One' }),
      setDoc(doc(db, 'users/lab2'), { role: 'Lab', active: true, approved: true, displayName: 'Lab Two' }),
      setDoc(doc(db, 'patients/patient-1'), { name: 'Patient One', age: 28, phone: '091234', created_by: 'mw' }),
      setDoc(doc(db, `voucher_price_sheets/${SHEET_ID}`), {
        labId: null,
        midwifeId: null,
        currency: 'MMK',
        status: 'published',
        serviceIds: ['urine-re'],
        services: [{
          serviceId: 'urine-re',
          serviceCode: 'URINE_RE',
          serviceName: 'Urine RE',
          subsidizedCostMinor: 500000,
          clientCostShareMinor: 50000,
          projectCostShareMinor: 450000
        }],
        publishedAt: new Date(),
        publishedBy: 'po'
      }),
      setDoc(doc(db, 'voucher_price_assignments/global'), {
        labId: null,
        midwifeId: null,
        priceSheetId: SHEET_ID,
        updatedAt: new Date(),
        updatedBy: 'po'
      }),
      setDoc(doc(db, 'voucher_account_quotas/mw'), {
        midwifeId: 'mw',
        allocatedUnits: 2,
        remainingUnits: 2,
        priceSheetId: SHEET_ID,
        status: 'active',
        lastVoucherId: '',
        updatedAt: new Date(),
        updatedBy: 'po'
      }),
      setDoc(doc(db, 'voucher_account_budgets/mw'), {
        midwifeId: 'mw',
        totalMinor: 1000000,
        currency: 'MMK',
        note: '',
        updatedAt: new Date(),
        updatedBy: 'po'
      })
    ]);
  });
}

async function issueVoucher() {
  const db = env.authenticatedContext('mw').firestore();
  const quotaRef = doc(db, 'voucher_account_quotas/mw');
  const voucherRef = doc(db, `vouchers/${VOUCHER_ID}`);
  await runTransaction(db, async (transaction) => {
    const quota = await transaction.get(quotaRef);
    transaction.update(quotaRef, {
      remainingUnits: quota.data().remainingUnits - 1,
      lastVoucherId: VOUCHER_ID,
      updatedAt: serverTimestamp(),
      updatedBy: 'mw'
    });
    transaction.set(voucherRef, {
      code: VOUCHER_ID,
      status: 'issued',
      patientId: 'patient-1',
      patientNameSnapshot: 'Patient One',
      patientAgeSnapshot: 28,
      patientPhoneSnapshot: '091234',
      patientNrcSnapshot: '',
            ancVisitDate: '2026-08-27',
      midwifeId: 'mw',
      issuerNameSnapshot: 'Maternity Home',
      labId: 'lab1',
      labNameSnapshot: 'Lab One',
      priceSheetId: SHEET_ID,
      selectedServiceIds: ['urine-re'],
      issuedAt: serverTimestamp(),
      expiresAt: new Date(Date.now() + 86400000)
    });
  });
}

test.before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8')
    }
  });
});

test.beforeEach(async () => {
  await env.clearFirestore();
  await seed();
});

test.after(async () => {
  await env.cleanup();
});

test('Program Officer can edit labels but cannot assign roles', async () => {
  const db = env.authenticatedContext('po').firestore();
  await assertSucceeds(updateDoc(doc(db, 'users/mw'), {
    displayName: 'Updated Maternity Home',
    description: 'Voucher provider',
    active: true,
    updatedAt: serverTimestamp(),
    updatedBy: 'po'
  }));
  await assertFails(updateDoc(doc(db, 'users/mw'), {
    role: 'Program Officer',
    updatedAt: serverTimestamp(),
    updatedBy: 'po'
  }));
});

test('Midwife can read quota but cannot read hidden budget', async () => {
  const db = env.authenticatedContext('mw').firestore();
  await assertSucceeds(getDoc(doc(db, 'voucher_account_quotas/mw')));
  await assertFails(getDoc(doc(db, 'voucher_account_budgets/mw')));
});

test('legacy blank-role Midwife retains clinical workflow access', async () => {
  const db = env.authenticatedContext('legacy-mw').firestore();
  await assertSucceeds(setDoc(doc(db, 'patients/legacy-patient'), {
    name: 'Legacy Patient',
    created_by: 'legacy-mw'
  }));
  await assertSucceeds(updateDoc(doc(db, 'patients/legacy-patient'), {
    hasConsent: true,
    consentStatus: 'consented',
    consentDate: serverTimestamp()
  }));
});

test('legacy Midwife without active field retains clinical workflow access', async () => {
  const db = env.authenticatedContext('hla').firestore();
  await assertSucceeds(setDoc(doc(db, 'patients/hla-patient'), {
    name: 'Hla Patient',
    created_by: 'hla'
  }));
  await assertSucceeds(updateDoc(doc(db, 'patients/hla-patient'), {
    hasConsent: true,
    consentStatus: 'consented',
    consentDate: serverTimestamp()
  }));
});

test('Midwife can probe an unused voucher code before issuing', async () => {
  const db = env.authenticatedContext('mw').firestore();
  await assertSucceeds(getDoc(doc(db, `vouchers/${VOUCHER_ID}`)));
});

test('voucher issuance and quota decrement must be atomic', async () => {
  await assertSucceeds(issueVoucher());
  const adminDb = env.authenticatedContext('po').firestore();
  const quota = await getDoc(doc(adminDb, 'voucher_account_quotas/mw'));
  assert.equal(quota.data().remainingUnits, 1);

  const midwifeDb = env.authenticatedContext('mw').firestore();
  await assertFails(setDoc(doc(midwifeDb, 'vouchers/CCCCCCCCCCCCCCCCCCCCCC'), {
    code: 'CCCCCCCCCCCCCCCCCCCCCC',
    status: 'issued'
  }));
});

test('only the selected Lab can redeem the voucher', async () => {
  await issueVoucher();
  const redeem = (uid) => {
    const db = env.authenticatedContext(uid).firestore();
    const ref = doc(db, `vouchers/${VOUCHER_ID}`);
    return runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (snapshot.data().status !== 'issued') throw new Error('already redeemed');
      transaction.update(ref, {
        status: 'redeemed',
        redeemedAt: serverTimestamp(),
        redeemedBy: uid,
        labDisplayNameSnapshot: uid,
        submissionReference: '',
        redemptionAudit: { action: 'redeemed', actorId: uid, at: serverTimestamp() }
      });
    });
  };
  await assertFails(redeem('lab2'));
  await assertSucceeds(redeem('lab1'));
});

test('Lab can list only its own redeemed submissions', async () => {
  await issueVoucher();
  const labDb = env.authenticatedContext('lab1').firestore();
  await updateDoc(doc(labDb, `vouchers/${VOUCHER_ID}`), {
    status: 'redeemed',
    redeemedAt: serverTimestamp(),
    redeemedBy: 'lab1',
    labDisplayNameSnapshot: 'Lab One',
    submissionReference: '',
    redemptionAudit: { action: 'redeemed', actorId: 'lab1', at: serverTimestamp() }
  });
  await assertSucceeds(getDocs(query(
    collection(labDb, 'vouchers'),
    where('redeemedBy', '==', 'lab1'),
    orderBy('redeemedAt', 'desc')
  )));
  await assertFails(getDocs(collection(labDb, 'vouchers')));
});
