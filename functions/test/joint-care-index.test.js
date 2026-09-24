'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const {
  isActiveLink,
  normalizedProviders
} = require('../src/analytics/joint-care-index')

test('Joint Care index accepts only active links', () => {
  assert.equal(isActiveLink({ status: 'active' }), true)
  assert.equal(isActiveLink({ status: 'Active' }), true)
  assert.equal(isActiveLink({ status: 'inactive' }), false)
  assert.equal(isActiveLink(null), false)
})

test('Joint Care providers are unique, stable, and empty-safe', () => {
  assert.deepEqual(
    normalizedProviders(['provider-2', 'provider-1', 'provider-2', null]),
    ['provider-1', 'provider-2']
  )
  assert.deepEqual(normalizedProviders(undefined), [])
})
