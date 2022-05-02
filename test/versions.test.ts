import { expect, test } from 'vitest'
import { getPackageData } from '../src/io/resolves'
import { getMaxSatisfying, getVersionRangePrefix } from '../src/utils/versions'

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
  expect('*').toBe(getVersionRangePrefix(''))

  // invaid
  expect(null).toBe(getVersionRangePrefix('.2.23'))

  // normalized
  expect('~').toBe(getVersionRangePrefix('1.2.x'))
  expect('^').toBe(getVersionRangePrefix('1.x'))
  expect('^').toBe(getVersionRangePrefix('1.x.0'))
  expect('*').toBe(getVersionRangePrefix('x'))
})

test('getMaxSatisfying', async () => {
  const { versions, tags } = await getPackageData('typescript')
  const latest = tags.latest
  const newest = tags.next

  // default
  expect(getMaxSatisfying(versions, '', 'default', tags)).toBeNull()
  expect(getMaxSatisfying(versions, '*', 'default', tags)).toBeNull()
  expect(getMaxSatisfying(versions, '4.0.0', 'default', tags)).toBeNull()
  expect(latest).toBe(getMaxSatisfying(versions, '^4.0.0', 'default', tags)?.version)
  expect(latest).toBe(getMaxSatisfying(versions, '>4.0.0', 'default', tags)?.version)

  // major
  expect(getMaxSatisfying(versions, '', 'major', tags)).not.toBeNull()
  expect(getMaxSatisfying(versions, '*', 'major', tags)).not.toBeNull()
  expect(getMaxSatisfying(versions, '4.0.0', 'major', tags)).not.toBeNull()
  expect(latest).toBe(getMaxSatisfying(versions, '^4.0.0', 'major', tags)?.version)
  expect(latest).toBe(getMaxSatisfying(versions, '>4.0.0', 'major', tags)?.version)

  // minor
  expect(getMaxSatisfying(versions, '', 'minor', tags)).toBeNull()
  expect(getMaxSatisfying(versions, '*', 'minor', tags)).toBeNull()
  expect(getMaxSatisfying(versions, '4.0.0', 'minor', tags)).not.toBeNull()
  expect(getMaxSatisfying(versions, '^4.0.0', 'minor', tags)).not.toBeNull()
  expect(getMaxSatisfying(versions, '>4.0.0', 'minor', tags)).not.toBeNull()

  // patch
  expect(getMaxSatisfying(versions, '', 'patch', tags)).toBeNull()
  expect(getMaxSatisfying(versions, '*', 'patch', tags)).toBeNull()
  expect(getMaxSatisfying(versions, '4.0.0', 'patch', tags)).not.toBeNull()
  expect(getMaxSatisfying(versions, '^4.0.0', 'patch', tags)).not.toBeNull()
  expect(getMaxSatisfying(versions, '>4.0.0', 'patch', tags)).not.toBeNull()

  // latest
  expect(latest).toBe(getMaxSatisfying(versions, '', 'latest', tags)?.version)
  expect(latest).toBe(getMaxSatisfying(versions, '*', 'latest', tags)?.version)
  expect(latest).toBe(getMaxSatisfying(versions, '4.0.0', 'latest', tags)?.version)
  expect(latest).toBe(getMaxSatisfying(versions, '^4.0.0', 'latest', tags)?.version)
  expect(latest).toBe(getMaxSatisfying(versions, '>4.0.0', 'latest', tags)?.version)

  // newest
  expect(newest).toBe(getMaxSatisfying(versions, '', 'newest', tags)?.version)
  expect(newest).toBe(getMaxSatisfying(versions, '*', 'newest', tags)?.version)
  expect(newest).toBe(getMaxSatisfying(versions, '4.0.0', 'newest', tags)?.version)
  expect(newest).toBe(getMaxSatisfying(versions, '^4.0.0', 'newest', tags)?.version)
  expect(newest).toBe(getMaxSatisfying(versions, '>4.0.0', 'newest', tags)?.version)
})
