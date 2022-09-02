import { describe, expect, test } from 'vitest'
import type { PackageData, ResolvedDepChange } from '../src'
import { sortDepChanges } from '../src/utils/sort'

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

  test('sorts ascending', () => {
    const changes: ResolvedDepChange[] = [pkgTypescript, pkgSemver, pkgYargs, pkgUnbuild]

    expect(sortDepChanges(changes, false)).toEqual(
      [
        pkgUnbuild,
        pkgSemver,
        pkgTypescript,
        pkgYargs,
      ],
    )
  })

  test('sorts descending', () => {
    const changes: ResolvedDepChange[] = [pkgTypescript, pkgSemver, pkgYargs, pkgUnbuild]

    expect(sortDepChanges(changes, true)).toEqual(
      [
        pkgYargs,
        pkgTypescript,
        pkgSemver,
        pkgUnbuild,
      ],
    )
  })
})
