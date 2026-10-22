const assert = require('node:assert/strict')
const test = require('node:test')
const OutcomeSystem = require('../js/outcome-system.js')

test('normalizes the shared maternal and newborn vocabularies', () => {
  assert.equal(OutcomeSystem.normalizeMaternal('Routine ANC'), 'alive')
  assert.equal(OutcomeSystem.normalizeMaternal('dead'), 'maternal_death')
  assert.equal(OutcomeSystem.normalizeNewborn('still_birth'), 'stillbirth')
  assert.equal(OutcomeSystem.normalizeNewborn('child_death'), 'death')
})

test('applies the clinical stage death periods', () => {
  assert.equal(OutcomeSystem.periodForStage('ANC'), 'antepartum')
  assert.equal(OutcomeSystem.periodForStage('delivery'), 'intrapartum')
  assert.equal(OutcomeSystem.periodForStage('PNC'), 'postpartum_42')
  assert.equal(OutcomeSystem.periodForStage('immediate newborn care'), 'neonatal_7')
  assert.equal(OutcomeSystem.periodForStage('newborn care'), 'neonatal_7_28')
})

test('requires structured maternal death details and newborn death reason', () => {
  assert.equal(OutcomeSystem.validate('maternal', {
    value: 'maternal_death',
    period: 'antepartum',
    cause: 'pregnancy_related'
  }).ok, false)
  assert.equal(OutcomeSystem.validate('maternal', {
    value: 'maternal_death',
    period: 'antepartum',
    cause: 'pregnancy_related',
    reason: 'Haemorrhage'
  }).ok, true)
  assert.equal(OutcomeSystem.validate('newborn', {
    value: 'death',
    period: 'neonatal_7'
  }).ok, false)
  assert.equal(OutcomeSystem.validate('newborn', {
    value: 'death',
    period: 'neonatal_7',
    reason: 'Respiratory distress'
  }).ok, true)
})

test('identifies only terminal clinical outcomes', () => {
  assert.equal(OutcomeSystem.isTerminal('maternal', 'abortion'), true)
  assert.equal(OutcomeSystem.isTerminal('maternal', 'alive'), false)
  assert.equal(OutcomeSystem.isTerminal('newborn', 'stillbirth'), true)
  assert.equal(OutcomeSystem.isTerminal('newborn', 'referred'), false)
})
