'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const {
  ANALYTICS_V3_SCHEMA_VERSION,
  INDICATOR_REGISTRY_V3
} = require('../src/analytics/v3-registry')
const {
  emptyV3Metrics,
  medicineReceived,
  isEarlyAncV3,
  deliveryFacts,
  calculateV3Metrics,
  reportingPeriodsForFacts
} = require('../src/analytics/v3-metrics')

const wrapped = (data) => ({ data })

const baseFacts = (overrides) => ({
  id: 'patient-1',
  profile: {
    created_at: '2026-08-01',
    age: 24,
    region: 'Yangon Region',
    township: 'Hlaing',
    created_by: 'provider-1'
  },
  scope: {
    region: 'Yangon Region',
    township: 'Hlaing',
    providerId: 'provider-1',
    facilityCode: '013',
    department: 'doph',
    facilityType: 'rhc',
    careTeamProviderIds: []
  },
  antenatalVisits: [],
  postpartumVisits: [],
  testRecords: [],
  newbornVisits: [],
  hrtActions: [],
  kmcActions: [],
  ...overrides
})

test('analytics-v3 registry covers exactly all 54 spreadsheet rows', () => {
  assert.equal(ANALYTICS_V3_SCHEMA_VERSION, 'analytics-v3.0.0')
  assert.equal(INDICATOR_REGISTRY_V3.length, 54)
  assert.deepEqual(
    INDICATOR_REGISTRY_V3.map((indicator) => indicator.row),
    Array.from({ length: 54 }, (_, index) => index + 1)
  )
  assert.deepEqual(
    new Set(INDICATOR_REGISTRY_V3.map((indicator) => indicator.section)),
    new Set([
      'Overview', 'ANC', 'High-Risk', 'Delivery',
      'Newborn', 'PNC', 'Referral', 'Joint Care'
    ])
  )
  const metrics = emptyV3Metrics()
  const readPath = (path) => path.split('.').reduce(
    (value, key) => value && value[key],
    metrics
  )
  INDICATOR_REGISTRY_V3.forEach((indicator) => {
    assert.ok(indicator.numeratorKey)
    assert.equal(indicator.definitionVersion, ANALYTICS_V3_SCHEMA_VERSION)
    assert.notEqual(readPath(indicator.numeratorKey), undefined)
    if (indicator.denominatorKey) {
      assert.notEqual(readPath(indicator.denominatorKey), undefined)
    }
  })
})

test('medicine received accepts Given or Prescribed without quantity', () => {
  assert.equal(medicineReceived('Given'), true)
  assert.equal(medicineReceived('Prescribed'), true)
  assert.equal(medicineReceived('Already Prescribed'), true)
  assert.equal(medicineReceived('Not Prescribed'), false)
  assert.equal(medicineReceived('Not Given'), false)
  assert.equal(medicineReceived(''), false)
})

test('ANC B1 and deworming enforce workbook gestational-age eligibility', () => {
  const metrics = calculateV3Metrics(baseFacts({
    antenatalVisits: [
      wrapped({
        visitDate: '2026-08-01',
        visitNumber: 1,
        gestationalAge: 12,
        deworming: 'Prescribed'
      }),
      wrapped({
        visitDate: '2026-08-08',
        visitNumber: 2,
        gestationalAge: 13,
        deworming: 'Given'
      }),
      wrapped({
        visitDate: '2026-08-15',
        visitNumber: 3,
        gestationalAge: 36,
        vitaminB1: 'Prescribed'
      }),
      wrapped({
        visitDate: '2026-08-22',
        visitNumber: 4,
        gestationalAge: 37,
        vitaminB1: 'Given'
      })
    ]
  }), '2026-08')
  assert.equal(metrics.anc.deworming, 1)
  assert.equal(metrics.anc.vitaminB1, 1)

  const ineligible = calculateV3Metrics(baseFacts({
    antenatalVisits: [
      wrapped({
        visitDate: '2026-08-01',
        gestationalAge: 12,
        deworming: 'Given'
      }),
      wrapped({
        visitDate: '2026-08-02',
        gestationalAge: 36,
        vitaminB1: 'Given'
      })
    ]
  }), '2026-08')
  assert.equal(ineligible.anc.deworming, 0)
  assert.equal(ineligible.anc.vitaminB1, 0)
})

test('Early ANC includes all of completed week 12 and excludes week 13', () => {
  assert.equal(isEarlyAncV3([
    { visitDate: '2026-04-01', lmp: '2026-01-01' }
  ], {}), true)
  assert.equal(isEarlyAncV3([
    { visitDate: '2026-04-02', lmp: '2026-01-01' }
  ], {}), false)
  assert.equal(isEarlyAncV3([
    { visitDate: '2026-04-01', gestationalAge: 12.85 }
  ], {}), true)
  assert.equal(isEarlyAncV3([
    { visitDate: '2026-04-01', gestationalAge: 13 }
  ], {}), false)
})

test('New and Old use the lifetime first service against the selected period', () => {
  const facts = baseFacts({
    antenatalVisits: [
      wrapped({ visitDate: '2026-07-20', visitNumber: 1 }),
      wrapped({ visitDate: '2026-08-10', visitNumber: 2 })
    ],
    postpartumVisits: [
      wrapped({ visitDate: '2026-08-12', visitNumber: 1 })
    ]
  })
  const august = calculateV3Metrics(facts, '2026-08')
  assert.equal(august.anc.clients, 1)
  assert.equal(august.anc.new, 0)
  assert.equal(august.anc.old, 1)
  assert.equal(august.pnc.new, 1)
  assert.equal(august.pnc.old, 0)
})

test('ANC and high-risk milestones only count in the identification period', () => {
  const facts = baseFacts({
    antenatalVisits: [
      wrapped({
        visitDate: '2026-07-01',
        visitNumber: 1,
        gestationalAge: 10
      }),
      wrapped({
        visitDate: '2026-08-01',
        visitNumber: 4,
        high_risk: 'yes',
        risk_factors: ['Hypertension']
      }),
      wrapped({
        visitDate: '2026-09-01',
        visitNumber: 5,
        high_risk: 'yes',
        risk_factors: ['Hypertension']
      })
    ]
  })
  const july = calculateV3Metrics(facts, '2026-07')
  const august = calculateV3Metrics(facts, '2026-08')
  const september = calculateV3Metrics(facts, '2026-09')
  assert.equal(july.anc.early, 1)
  assert.equal(august.anc.early, 0)
  assert.equal(august.anc.atLeast4, 1)
  assert.equal(september.anc.atLeast4, 0)
  assert.equal(august.highRisk.clients, 1)
  assert.equal(september.highRisk.clients, 0)
})

test('Yangon month boundaries place UTC events in the local reporting month', () => {
  const facts = baseFacts({
    profile: {
      created_at: '2026-07-31T17:30:00.000Z',
      age: 24
    },
    antenatalVisits: [
      wrapped({ visitDate: '2026-08-31T17:29:59.999Z' }),
      wrapped({ visitDate: '2026-08-31T17:30:00.000Z' })
    ]
  })
  const august = calculateV3Metrics(facts, '2026-08')
  const september = calculateV3Metrics(facts, '2026-09')
  assert.equal(august.registration.new, 1)
  assert.equal(august.anc.services, 1)
  assert.equal(september.anc.services, 1)
  assert.deepEqual(reportingPeriodsForFacts(facts), [
    '2026', '2026-08', '2026-09', 'all'
  ])
})

test('Delivery Notes are authoritative and skilled means SBA or AMW only', () => {
  const facts = baseFacts({
    deliveryNotes: wrapped({
      thirdStage: { oxytocinGiven: true },
      deliveryDetails: {
        birthProvider: 'self',
        birthPlace: 'home',
        modeOfDelivery: 'normal',
        maternalCondition: 'alive',
        babies: [{
          birthTime: '2026-08-10T10:00:00+06:30',
          outcome: 'alive',
          birthWeightGram: 2499
        }]
      }
    }),
    newbornVisits: [wrapped({
      visitDate: '2026-08-11',
      birthplace: 'private_facility',
      birth_provider: 'skilled_birth_attendant',
      body_weight_gram: 3500
    })]
  })
  const delivery = deliveryFacts(facts)
  const metrics = calculateV3Metrics(facts, '2026-08')
  assert.equal(delivery.source, 'delivery_notes')
  assert.equal(metrics.delivery.completedNotes, 1)
  assert.equal(metrics.delivery.homeSkilled, 0)
  assert.equal(metrics.delivery.institutionalSkilled, 0)
  assert.equal(metrics.delivery.places.Home, 1)
  assert.equal(metrics.newborn.lowBirthWeight, 1)

  facts.deliveryNotes.data.deliveryDetails.birthProvider = 'amw'
  const amw = calculateV3Metrics(facts, '2026-08')
  assert.equal(amw.delivery.homeSkilled, 1)
})

test('legacy delivery fallback is used only when Delivery Notes are absent', () => {
  const facts = baseFacts({
    birthRecord: wrapped({
      deliveryDate: '2026-08-10',
      newbornOutcome: 'alive'
    }),
    newbornVisits: [wrapped({
      visitDate: '2026-08-11',
      birth_time: '2026-08-10',
      birthplace: 'government_hospital',
      birth_provider: 'skilled_birth_attendant',
      mode_of_delivery: 'normal_vaginal',
      outcome: 'alive',
      body_weight_gram: 2500
    })]
  })
  const normalized = deliveryFacts(facts)
  const metrics = calculateV3Metrics(facts, '2026-08')
  assert.equal(normalized.source, 'legacy_fallback')
  assert.equal(metrics.delivery.institutionalSkilled, 1)
  assert.equal(metrics.newborn.lowBirthWeight, 0)
})

test('newborn, PNC, referral, and Joint Care definitions use confirmed denominators', () => {
  const facts = baseFacts({
    scope: {
      careTeamProviderIds: ['joint-provider'],
      region: 'Yangon Region',
      township: 'Hlaing'
    },
    antenatalVisits: [
      wrapped({
        visitDate: '2026-08-01',
        visitNumber: 4,
        ironFolicAcid: 'Prescribed',
        vitaminB1: 'Given',
        deworming: 'Prescribed',
        gbvSuspected: 'yes',
        tbSymptoms: 'yes'
      })
    ],
    deliveryNotes: wrapped({
      deliveryDetails: {
        gestationalWeek: 36,
        birthProvider: 'skilled_birth_attendant',
        birthPlace: 'government_hospital',
        modeOfDelivery: 'normal',
        maternalCondition: 'alive',
        babies: [{
          birthTime: '2026-08-10',
          outcome: 'alive',
          birthWeightGram: 2500
        }]
      }
    }),
    immediateNewbornCare: wrapped({
      support_early_exclusive_breastfeeding: true
    }),
    newbornVisits: [wrapped({
      visitDate: '2026-08-11',
      visit_number: 1,
      kmc_selected: 'yes'
    })],
    postpartumVisits: [wrapped({
      visitDate: '2026-08-12',
      visitNumber: 1,
      ironFolic: true,
      vitaminBComplex: true,
      vaginalBleeding: 'Heavy bleeding'
    })],
    transferRecord: wrapped({
      referralTime: '2026-08-15',
      careContext: 'labour',
      transferDestination: 'external',
      externalFacility: 'Historical clinic'
    })
  })
  const metrics = calculateV3Metrics(facts, '2026-08')
  assert.equal(metrics.newborn.liveBirths, 1)
  assert.equal(metrics.newborn.birthWeightMeasured, 1)
  assert.equal(metrics.newborn.lowBirthWeight, 0)
  assert.equal(metrics.newborn.kmcEligible, 1)
  assert.equal(metrics.newborn.kmcReceived, 1)
  assert.equal(metrics.newborn.earlyBreastfeeding, 1)
  assert.equal(metrics.pnc.deliveredMothers, 1)
  assert.equal(metrics.pnc.within48Hours, 1)
  assert.equal(metrics.pnc.pph, 1)
  assert.equal(metrics.referral.total, 1)
  assert.equal(metrics.referral.byStage.Delivery, 1)
  assert.equal(metrics.referral.byDestination['Other/Unknown'], 1)
  assert.equal(metrics.jointCare.clients, 1)
  assert.equal(metrics.jointCare.byStatus.ANC, 1)
  assert.equal(metrics.jointCare.byStatus.Delivery, 1)
  assert.equal(metrics.jointCare.byStatus.PNC, 1)
  assert.equal(metrics.jointCare.byStatus.Newborn, 1)
  assert.equal(metrics.jointCare.byStatus.KMC, 1)
})

test('delivered-mother denominator does not depend on newborn survival', () => {
  const metrics = calculateV3Metrics(baseFacts({
    deliveryNotes: wrapped({
      deliveryDetails: {
        birthProvider: 'amw',
        birthPlace: 'home',
        maternalCondition: 'alive',
        babies: [{
          birthTime: '2026-08-10',
          outcome: 'stillbirth',
          birthWeightGram: 2400
        }]
      }
    })
  }), '2026-08')
  assert.equal(metrics.pnc.deliveredMothers, 1)
  assert.equal(metrics.newborn.liveBirths, 0)
  assert.equal(metrics.newborn.lowBirthWeight, 0)
})

test('PNC medicines and structured referral destinations use the workbook sources', () => {
  const metrics = calculateV3Metrics(baseFacts({
    antenatalVisits: [wrapped({
      visitDate: '2026-08-01',
      gestationalAge: 38,
      ironFolicAcid: 'Prescribed'
    })],
    deliveryNotes: wrapped({
      deliveryDetails: {
        birthProvider: 'amw',
        birthPlace: 'home',
        maternalCondition: 'alive',
        babies: [{ birthTime: '2026-08-10', outcome: 'alive', birthWeightGram: 3000 }]
      }
    }),
    postpartumVisits: [wrapped({
      visitDate: '2026-08-20',
      vitaminBComplex: true
    })],
    transferRecord: wrapped({
      referralTime: '2026-08-21',
      transferDestination: 'external',
      referralFacilityType: 'township_hospital'
    })
  }), '2026-08')
  assert.equal(metrics.pnc.ironFolate, 1)
  assert.equal(metrics.pnc.vitaminB1, 1)
  assert.equal(metrics.referral.byDestination['Township Hospital'], 1)
})
