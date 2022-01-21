import { expect, test } from 'vitest'
import { getVersionRangePrefix } from '../src/utils/versions'

test('getVersionRange', () => {
  expect('~').toBe(getVersionRangePrefix('~1.2.3'))
  expect('~').toBe(getVersionRangePrefix('~1.2.x'))
  expect('^').toBe(getVersionRangePrefix('^1.2.x'))
  expect('').toBe(getVersionRangePrefix('1.2'))
  expect('>=').toBe(getVersionRangePrefix('>=1.2'))
  expect('>').toBe(getVersionRangePrefix('>1.2'))
  expect('<=').toBe(getVersionRangePrefix('<=1.2'))
  expect('<=').toBe(getVersionRangePrefix('   <=1.2.4   '))
  expect('<').toBe(getVersionRangePrefix('<1.2'))

  // wildcard
  expect('*').toBe(getVersionRangePrefix('*'))

  // invaid
  expect(null).toBe(getVersionRangePrefix('.2.23'))

  // normalized
  expect('~').toBe(getVersionRangePrefix('1.2.x'))
  expect('^').toBe(getVersionRangePrefix('1.x'))
  expect('^').toBe(getVersionRangePrefix('1.x.0'))
  expect('*').toBe(getVersionRangePrefix('x'))
})
