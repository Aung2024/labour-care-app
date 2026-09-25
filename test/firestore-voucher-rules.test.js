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
        serviceIds: ['urine-re', 'hb'],
        services: [{
          serviceId: 'urine-re',
          serviceCode: 'URINE_RE',
          serviceName: 'Urine RE',
          regularPriceMinor: 500000,
          labCostShareMinor: 50000,
          subsidizedCostMinor: 450000,
          clientCostShareMinor: 45000,
          projectCostShareMinor: 405000
        }, {
          serviceId: 'hb',
          serviceCode: 'HB',
          serviceName: 'Hb%',
          regularPriceMinor: 400000,
          labCostShareMinor: 40000,
          subsidizedCostMinor: 360000,
          clientCostShareMinor: 36000,
          projectCostShareMinor: 324000
        }],
        pricesByServiceId: {
          'urine-re': {
            regularPriceMinor: 500000,
            labCostShareMinor: 50000,
            clientCostShareMinor: 45000,
            projectCostShareMinor: 405000
          },
          hb: {
            regularPriceMinor: 400000,
            labCostShareMinor: 40000,
            clientCostShareMinor: 36000,
            projectCostShareMinor: 324000
          }
        },
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

test('new Midwife can self-register only while pending', async () => {
  const okDb = env.authenticatedContext('new-mw').firestore();
  await assertSucceeds(setDoc(doc(okDb, 'users/new-mw'), {
    name: 'Daw New Midwife',
    role: 'Midwife',
    email: 'new-mw@example.com',
    approved: false,
    active: false,
    status: 'pending',
    region: 'Mandalay Region',
    township: 'Mahaaungmyay'
  }));

  const approvedDb = env.authenticatedContext('new-mw-approved').firestore();
  await assertFails(setDoc(doc(approvedDb, 'users/new-mw-approved'), {
    name: 'Should Fail',
    role: 'Midwife',
    approved: true,
    active: true
  }));

  const missingActiveDb = env.authenticatedContext('new-mw-no-active').firestore();
  await assertFails(setDoc(doc(missingActiveDb, 'users/new-mw-no-active'), {
    name: 'Missing active',
    role: 'Midwife',
    approved: false
  }));
});

test('Midwife can read own quota and remaining budget', async () => {
  const db = env.authenticatedContext('mw').firestore();
  await assertSucceeds(getDoc(doc(db, 'voucher_account_quotas/mw')));
  await assertSucceeds(getDoc(doc(db, 'voucher_account_budgets/mw')));
  await assertFails(getDoc(doc(db, 'voucher_account_budgets/hla')));
});

test('laboratory role alias can look up vouchers', async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'users/lab-alias'), {
      role: 'laboratory',
      active: true,
      status: 'approved',
      displayName: 'Lab Alias'
    });
  });
  await issueVoucher();
  const labDb = env.authenticatedContext('lab-alias').firestore();
  await assertSucceeds(getDoc(doc(labDb, `vouchers/${VOUCHER_ID}`)));
});

test('Program Officer with status approved can read allocations', async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'users/po-status'), {
      role: 'programme officer',
      active: true,
      approved: false,
      status: 'approved',
      displayName: 'PO Status'
    });
  });
  const poDb = env.authenticatedContext('po-status').firestore();
  await assertSucceeds(getDocs(collection(poDb, 'voucher_account_quotas')));
  await assertSucceeds(getDocs(collection(poDb, 'voucher_account_budgets')));
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

async function writeClientSignature(uid) {
  const db = env.authenticatedContext(uid).firestore();
  await setDoc(doc(db, `vouchers/${VOUCHER_ID}/artifacts/signatures`), {
    clientSignature: 'data:image/png;base64,aaaaaaaaaaaaaaaaaaaa',
    cashierSignature: '',
    labSeal: '',
    poSignature: '',
    updatedAt: serverTimestamp(),
    updatedBy: uid
  });
}

function redeemPayload(uid) {
  return {
    status: 'redeemed',
    redeemedAt: serverTimestamp(),
    redeemedBy: uid,
    labDisplayNameSnapshot: uid,
    submissionReference: '',
    cashierIndex: 0,
    cashierNameSnapshot: 'Cashier 1',
    labSealAttached: false,
    clientSigned: true,
    redemptionAudit: { action: 'redeemed', actorId: uid, at: serverTimestamp() }
  };
}

test('only the selected Lab can redeem the voucher', async () => {
  await issueVoucher();
  await writeClientSignature('lab1');
  const redeem = (uid) => {
    const db = env.authenticatedContext(uid).firestore();
    const ref = doc(db, `vouchers/${VOUCHER_ID}`);
    return runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (snapshot.data().status !== 'issued') throw new Error('already redeemed');
      transaction.update(ref, redeemPayload(uid));
    });
  };
  await assertFails(redeem('lab2'));
  await assertSucceeds(redeem('lab1'));
});

test('Lab redeem requires a client signature artifact', async () => {
  await issueVoucher();
  const db = env.authenticatedContext('lab1').firestore();
  await assertFails(updateDoc(doc(db, `vouchers/${VOUCHER_ID}`), redeemPayload('lab1')));
  await writeClientSignature('lab1');
  await assertSucceeds(updateDoc(doc(db, `vouchers/${VOUCHER_ID}`), redeemPayload('lab1')));
});

test('Lab can add or remove catalog tests on an issued voucher', async () => {
  await issueVoucher();
  const db = env.authenticatedContext('lab1').firestore();
  await assertSucceeds(updateDoc(doc(db, `vouchers/${VOUCHER_ID}`), {
    selectedServiceIds: ['urine-re', 'hb']
  }));
  await assertFails(updateDoc(doc(db, `vouchers/${VOUCHER_ID}`), {
    selectedServiceIds: ['unknown-test']
  }));
  await assertFails(updateDoc(doc(db, `vouchers/${VOUCHER_ID}`), {
    selectedServiceIds: ['urine-re'],
    lineItems: [
      { serviceId: 'urine-re', serviceName: 'Urine RE', regularPriceMinor: 1, labCostShareMinor: 0, clientCopayMinor: 0, projectContributionMinor: 1 }
    ],
    totals: { regularPriceMinor: 1, labCostShareMinor: 0, clientCopayMinor: 0, projectContributionMinor: 1 }
  }));
});

test('Program Officer can verify reject and pay redeemed vouchers', async () => {
  await issueVoucher();
  const labDb = env.authenticatedContext('lab1').firestore();
  await writeClientSignature('lab1');
  await updateDoc(doc(labDb, `vouchers/${VOUCHER_ID}`), redeemPayload('lab1'));
  const poDb = env.authenticatedContext('po').firestore();
  await assertFails(updateDoc(doc(labDb, `vouchers/${VOUCHER_ID}`), {
    status: 'verified',
    verifiedAt: serverTimestamp(),
    verifiedBy: 'lab1'
  }));
  await assertSucceeds(updateDoc(doc(poDb, `vouchers/${VOUCHER_ID}`), {
    status: 'verified',
    verifiedAt: serverTimestamp(),
    verifiedBy: 'po',
    poNameSnapshot: 'Officer',
    poDesignationSnapshot: 'PO',
    verificationAudit: { action: 'verified', actorId: 'po', at: serverTimestamp() }
  }));
  await assertSucceeds(updateDoc(doc(poDb, `vouchers/${VOUCHER_ID}`), {
    status: 'paid',
    paidAt: serverTimestamp(),
    paidBy: 'po',
    paymentAudit: { action: 'paid', actorId: 'po', at: serverTimestamp() }
  }));
});

test('rejected vouchers cannot be verified again', async () => {
  await issueVoucher();
  const labDb = env.authenticatedContext('lab1').firestore();
  await writeClientSignature('lab1');
  await updateDoc(doc(labDb, `vouchers/${VOUCHER_ID}`), redeemPayload('lab1'));
  const poDb = env.authenticatedContext('po').firestore();
  await assertSucceeds(updateDoc(doc(poDb, `vouchers/${VOUCHER_ID}`), {
    status: 'rejected',
    rejectedAt: serverTimestamp(),
    rejectedBy: 'po',
    rejectReason: 'Incomplete tests',
    rejectionAudit: { action: 'rejected', actorId: 'po', at: serverTimestamp() }
  }));
  await assertFails(updateDoc(doc(poDb, `vouchers/${VOUCHER_ID}`), {
    status: 'verified',
    verifiedAt: serverTimestamp(),
    verifiedBy: 'po'
  }));
});

test('Lab can list vouchers assigned to that laboratory', async () => {
  await issueVoucher();
  const labDb = env.authenticatedContext('lab1').firestore();
  await assertSucceeds(getDocs(query(
    collection(labDb, 'vouchers'),
    where('labId', '==', 'lab1'),
    orderBy('issuedAt', 'desc')
  )));
});

test('Lab can list only its own redeemed submissions', async () => {
  await issueVoucher();
  const labDb = env.authenticatedContext('lab1').firestore();
  await writeClientSignature('lab1');
  await updateDoc(doc(labDb, `vouchers/${VOUCHER_ID}`), redeemPayload('lab1'));
  await assertSucceeds(getDocs(query(
    collection(labDb, 'vouchers'),
    where('redeemedBy', '==', 'lab1'),
    orderBy('redeemedAt', 'desc')
  )));
  await assertFails(getDocs(collection(labDb, 'vouchers')));
});

test('period stats cannot be written without a coupled voucher status change', async () => {
  await issueVoucher();
  const labDb = env.authenticatedContext('lab1').firestore();
  await assertFails(setDoc(doc(labDb, 'voucher_period_stats/lab_lab1_2026-09'), {
    scope: 'lab',
    period: '2026-09',
    labId: 'lab1',
    midwifeId: '',
    lastVoucherId: VOUCHER_ID,
    lastStatus: 'redeemed',
    counts: { issued: 0, redeemed: 1, verified: 0, paid: 0, rejected: 0 },
    projectVerifiedMinor: 0,
    projectPaidMinor: 0,
    updatedAt: serverTimestamp(),
    updatedBy: 'lab1'
  }));
  const midwifeDb = env.authenticatedContext('mw').firestore();
  await assertFails(setDoc(doc(midwifeDb, 'voucher_period_stats/global_2026-09'), {
    scope: 'global',
    period: '2026-09',
    labId: '',
    midwifeId: '',
    lastVoucherId: VOUCHER_ID,
    lastStatus: 'issued',
    counts: { issued: 99, redeemed: 0, verified: 0, paid: 0, rejected: 0 },
    projectVerifiedMinor: 0,
    projectPaidMinor: 0,
    updatedAt: serverTimestamp(),
    updatedBy: 'mw'
  }));
});

test('Lab cannot inflate period-stat money during redeem', async () => {
  await issueVoucher();
  await writeClientSignature('lab1');
  const db = env.authenticatedContext('lab1').firestore();
  await assertFails(runTransaction(db, async (transaction) => {
    transaction.update(doc(db, `vouchers/${VOUCHER_ID}`), redeemPayload('lab1'));
    transaction.set(doc(db, 'voucher_period_stats/lab_lab1_2026-09'), {
      scope: 'lab',
      period: '2026-09',
      labId: 'lab1',
      midwifeId: '',
      lastVoucherId: VOUCHER_ID,
      lastStatus: 'redeemed',
      counts: { issued: 0, redeemed: 1, verified: 0, paid: 0, rejected: 0 },
      projectVerifiedMinor: 999999000,
      projectPaidMinor: 0,
      midwives: {},
      updatedAt: serverTimestamp(),
      updatedBy: 'lab1'
    });
  }));
});

test('Lab cannot overwrite another laboratory signature artifact', async () => {
  await issueVoucher();
  const otherLab = env.authenticatedContext('lab2').firestore();
  await assertFails(setDoc(doc(otherLab, `vouchers/${VOUCHER_ID}/artifacts/signatures`), {
    clientSignature: 'data:image/png;base64,bbbbbbbbbbbbbbbbbbbb',
    cashierSignature: '',
    labSeal: '',
    poSignature: '',
    updatedAt: serverTimestamp(),
    updatedBy: 'lab2'
  }));
});

test('Lab can write period stats only in the redeem transaction', async () => {
  await issueVoucher();
  await writeClientSignature('lab1');
  const db = env.authenticatedContext('lab1').firestore();
  const voucherRef = doc(db, `vouchers/${VOUCHER_ID}`);
  const statsRef = doc(db, 'voucher_period_stats/lab_lab1_2026-09');
  await assertSucceeds(runTransaction(db, async (transaction) => {
    transaction.update(voucherRef, redeemPayload('lab1'));
    transaction.set(statsRef, {
      scope: 'lab',
      period: '2026-09',
      labId: 'lab1',
      midwifeId: '',
      lastVoucherId: VOUCHER_ID,
      lastStatus: 'redeemed',
      counts: { issued: 0, redeemed: 1, verified: 0, paid: 0, rejected: 0 },
      projectVerifiedMinor: 0,
      projectPaidMinor: 0,
      midwives: {},
      updatedAt: serverTimestamp(),
      updatedBy: 'lab1'
    });
  }));
});
