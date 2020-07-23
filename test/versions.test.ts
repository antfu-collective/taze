import test from 'ava'
import { getVersionRangePrefix } from '../src/utils/versions'

test('getVersionRange', (t) => {
  t.is('~', getVersionRangePrefix('~1.2.3'))
  t.is('~', getVersionRangePrefix('~1.2.x'))
  t.is('^', getVersionRangePrefix('^1.2.x'))
  t.is('', getVersionRangePrefix('1.2'))
  t.is('>=', getVersionRangePrefix('>=1.2'))
  t.is('>', getVersionRangePrefix('>1.2'))
  t.is('<=', getVersionRangePrefix('<=1.2'))
  t.is('<=', getVersionRangePrefix('   <=1.2.4   '))
  t.is('<', getVersionRangePrefix('<1.2'))

  // wildcard
  t.is('*', getVersionRangePrefix('*'))

  // invaid
  t.is(null, getVersionRangePrefix('.2.23'))

  // normalized
  t.is('~', getVersionRangePrefix('1.2.x'))
  t.is('^', getVersionRangePrefix('1.x'))
  t.is('^', getVersionRangePrefix('1.x.0'))
  t.is('*', getVersionRangePrefix('x'))
})
