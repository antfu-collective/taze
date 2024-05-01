import { expect, it } from 'vitest'
import { getPackageData } from '../src/io/resolves'
import { getMaxSatisfying, getVersionRangePrefix } from '../src/utils/versions'

it('getVersionRange', () => {
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

it('getMaxSatisfying', async () => {
  const { versions, tags } = await getPackageData('typescript')
  const latest = tags.latest
  const newest = tags.next

  // default
  expect(getMaxSatisfying(versions, '', 'default', tags)).toBeUndefined()
  expect(getMaxSatisfying(versions, '*', 'default', tags)).toBeUndefined()
  expect(getMaxSatisfying(versions, '5.0.0', 'default', tags)).toBeUndefined()
  expect(latest).toBe(getMaxSatisfying(versions, '^5.0.0', 'default', tags))
  expect(latest).toBe(getMaxSatisfying(versions, '>5.0.0', 'default', tags))

  // major
  expect(getMaxSatisfying(versions, '', 'major', tags)).not.toBeUndefined()
  expect(getMaxSatisfying(versions, '*', 'major', tags)).not.toBeUndefined()
  expect(getMaxSatisfying(versions, '5.0.0', 'major', tags)).not.toBeUndefined()
  expect(latest).toBe(getMaxSatisfying(versions, '^5.0.0', 'major', tags))
  expect(latest).toBe(getMaxSatisfying(versions, '>5.0.0', 'major', tags))

  // minor
  expect(getMaxSatisfying(versions, '', 'minor', tags)).toBeUndefined()
  expect(getMaxSatisfying(versions, '*', 'minor', tags)).toBeUndefined()
  expect(getMaxSatisfying(versions, '5.0.0', 'minor', tags)).not.toBeUndefined()
  expect(getMaxSatisfying(versions, '^5.0.0', 'minor', tags)).not.toBeUndefined()
  expect(getMaxSatisfying(versions, '>5.0.0', 'minor', tags)).not.toBeUndefined()

  // patch
  expect(getMaxSatisfying(versions, '', 'patch', tags)).toBeUndefined()
  expect(getMaxSatisfying(versions, '*', 'patch', tags)).toBeUndefined()
  expect(getMaxSatisfying(versions, '5.0.0', 'patch', tags)).not.toBeUndefined()
  expect(getMaxSatisfying(versions, '^5.0.0', 'patch', tags)).not.toBeUndefined()
  expect(getMaxSatisfying(versions, '>5.0.0', 'patch', tags)).not.toBeUndefined()

  // latest
  expect(latest).toBe(getMaxSatisfying(versions, '', 'latest', tags))
  expect(latest).toBe(getMaxSatisfying(versions, '*', 'latest', tags))
  expect(latest).toBe(getMaxSatisfying(versions, '5.0.0', 'latest', tags))
  expect(latest).toBe(getMaxSatisfying(versions, '^5.0.0', 'latest', tags))
  expect(latest).toBe(getMaxSatisfying(versions, '>5.0.0', 'latest', tags))

  // newest
  expect(newest).toBe(getMaxSatisfying(versions, '', 'newest', tags))
  expect(newest).toBe(getMaxSatisfying(versions, '*', 'newest', tags))
  expect(newest).toBe(getMaxSatisfying(versions, '5.0.0', 'newest', tags))
  expect(newest).toBe(getMaxSatisfying(versions, '^5.0.0', 'newest', tags))
  expect(newest).toBe(getMaxSatisfying(versions, '>5.0.0', 'newest', tags))

  // should not exceed latest version if it is in specified range, see #31
  expect('1.0.0-alpha.4').toBe(getMaxSatisfying([
    '1.0.0-alpha.1',
    '1.0.0-alpha.2',
    '1.0.0-alpha.3',
    '1.0.0-alpha.4',
    '1.0.0-draft.1',
    '1.0.0-draft.2',
    '1.0.0-draft.3',
    '1.0.0-draft.4',
  ], '^1.0.0-alpha.1', 'default', {
    latest: '1.0.0-alpha.4',
    next: '1.0.0-draft.4',
  }))

  // should return the last version on newest mode
  // a good test case for this is @sveltejs/vite-plugin-svelte
  expect('1.0.0-next.4').toBe(getMaxSatisfying([
    '1.0.0-next.1',
    '1.0.0-next.2',
    '1.0.0-next.3',
    '1.0.0-next.4',
  ], '^1.0.0-next.1', 'newest', {
    latest: '1.0.0-next.4',
    next: '1.0.0-next.2',
  }))

  // should return the next tag version on next mode
  // a good test case for this is eslint-plugin-react-hooks
  expect('5.1.0-beta-4508873393-20240430').toBe(getMaxSatisfying([
    '4.6.1',
    '4.6.2',
    '5.1.0-beta-4508873393-20240430',
    '0.0.0-experimental-4508873393-20240430',
  ], '^1.0.0-next.1', 'next', {
    latest: '4.6.2',
    next: '5.1.0-beta-4508873393-20240430',
    rc: '4.2.1-rc.3',
    experimental: '0.0.0-experimental-4508873393-20240430',
  }))
}, 10_000)
