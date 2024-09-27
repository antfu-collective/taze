import type { PackageData, ResolvedDepChange } from '../src'
import { describe, expect, it } from 'vitest'
import { parseSortOption, sortDepChanges } from '../src/utils/sort'

describe('sort resolvedDepChanges', () => {
  const pkgData: PackageData = {
    tags: {},
    versions: [],
  }

  const pkgTypescript: ResolvedDepChange = {
    name: 'typescript',
    currentVersion: '^4.7.4',
    source: 'devDependencies',
    update: true,
    pkgData,
    targetVersion: '^4.8.2',
    targetVersionTime: '2022-08-25T23:05:19.632Z',
    currentVersionTime: '2022-06-17T18:21:36.833Z',
    diff: 'minor',
  }
  const pkgSemver: ResolvedDepChange = {
    name: '@types/semver',
    currentVersion: '^7.3.10',
    source: 'devDependencies',
    update: true,
    pkgData,
    targetVersion: '^7.3.12',
    targetVersionTime: '2022-08-11T21:32:18.856Z',
    currentVersionTime: '2022-06-15T15:31:45.821Z',
    diff: 'patch',
  }
  const pkgYargs: ResolvedDepChange = {
    name: '@types/yargs',
    currentVersion: '^17.0.10',
    source: 'devDependencies',
    update: true,
    pkgData,
    targetVersion: '^17.0.12',
    targetVersionTime: '2022-08-29T23:35:23.067Z',
    currentVersionTime: '2022-03-17T22:32:10.747Z',
    diff: 'patch',
  }
  const pkgUnbuild: ResolvedDepChange = {
    name: 'unbuild',
    currentVersion: '^0.7.4',
    source: 'devDependencies',
    update: true,
    pkgData,
    targetVersion: '^0.7.6',
    targetVersionTime: '2022-07-20T16:29:20.516Z',
    currentVersionTime: '2022-04-13T18:40:08.452Z',
    diff: 'patch',
    latestVersionAvailable: '0.8.10',
  }

  const input = Object.freeze([pkgTypescript, pkgSemver, pkgYargs, pkgUnbuild])
  const getOrderChange = (sorted: ResolvedDepChange[]) => input.map(i => sorted.indexOf(i))

  describe('sorts by time', () => {
    it('sorts ascending', () => {
      expect(getOrderChange(sortDepChanges(input, 'time-asc', false))).toMatchInlineSnapshot(`
        [
          1,
          2,
          0,
          3,
        ]
      `)
    })

    it('sorts descending', () => {
      expect(getOrderChange(sortDepChanges(input, 'time-desc', false))).toMatchInlineSnapshot(`
        [
          2,
          1,
          3,
          0,
        ]
      `)
    })
  })

  describe('sorts by time difference', () => {
    it('sorts ascending', () => {
      expect(getOrderChange(sortDepChanges(input, 'diff-asc', false))).toMatchInlineSnapshot(`
        [
          0,
          1,
          2,
          3,
        ]
      `)
    })

    it('sorts descending', () => {
      expect(getOrderChange(sortDepChanges(input, 'diff-desc', false))).toMatchInlineSnapshot(`
        [
          3,
          2,
          1,
          0,
        ]
      `)
    })
  })

  describe('parseSortOption', () => {
    it('parses key and order', () => {
      expect(parseSortOption('time-asc')).toEqual(['time', 'asc'])
      expect(parseSortOption('diff-asc')).toEqual(['diff', 'asc'])

      expect(parseSortOption('time-desc')).toEqual(['time', 'desc'])
      expect(parseSortOption('diff-desc')).toEqual(['diff', 'desc'])
    })
  })
})
