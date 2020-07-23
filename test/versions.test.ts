import test from 'ava'
import { getVersionRange } from '../src/utils/versions'

test('getVersionRange', (t) => {
  t.is('~', getVersionRange('~1.2.3'))
  t.is('~', getVersionRange('~1.2.x'))
  t.is('^', getVersionRange('^1.2.x'))
  t.is('', getVersionRange('1.2'))
  t.is('>=', getVersionRange('>=1.2'))
  t.is('>', getVersionRange('>1.2'))
  t.is('<=', getVersionRange('<=1.2'))
  t.is('<=', getVersionRange('   <=1.2.4   '))
  t.is('<', getVersionRange('<1.2'))
  t.is('*', getVersionRange('*'))
  t.is(null, getVersionRange('.2.23'))
})
