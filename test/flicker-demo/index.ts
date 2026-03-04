import type { DiffType, PackageData, PackageJsonMeta, ResolvedDepChange } from '../../src/types'
/**
 * Demo to test the flicker issue in the interactive mode.
 *
 * Test with 2000 dependencies, run with:
 * npx tsx test/flicker-demo/index.ts 2000
 */
import process from 'node:process'
import { promptInteractive } from '../../src/commands/check/interactive'

const COUNT = Number(process.argv[2]) || 50

function mockPkgData(current: string, target: string): PackageData {
  return {
    tags: { latest: target.replace(/^[~^]/, '') },
    versions: [current.replace(/^[~^]/, ''), target.replace(/^[~^]/, '')],
    time: {
      [current.replace(/^[~^]/, '')]: new Date(Date.now() - 90 * 86400000).toISOString(),
      [target.replace(/^[~^]/, '')]: new Date(Date.now() - 3 * 86400000).toISOString(),
    },
  }
}

function mockDep(i: number): ResolvedDepChange {
  const current = `^${i % 10}.${i % 5}.0`
  const target = `^${i % 10}.${(i % 5) + 1}.${i % 8}`
  return {
    name: `@scope/package-${String(i).padStart(3, '0')}`,
    currentVersion: current,
    targetVersion: target,
    currentVersionTime: new Date(Date.now() - 90 * 86400000).toISOString(),
    targetVersionTime: new Date(Date.now() - 3 * 86400000).toISOString(),
    source: 'devDependencies',
    update: true,
    diff: 'minor' as DiffType,
    pkgData: mockPkgData(current, target),
    provenanceDowngraded: false,
  }
}

function generatePkgMeta(n: number): PackageJsonMeta {
  return {
    name: 'demo-project',
    private: true,
    version: '1.0.0',
    filepath: '/tmp/demo/package.json',
    relative: 'package.json',
    type: 'package.json',
    raw: {},
    deps: [],
    resolved: Array.from({ length: n }, (_, i) => mockDep(i)),
  }
}

const pkgs = [generatePkgMeta(COUNT)]

promptInteractive(pkgs, {
  mode: 'minor',
  sort: 'diff-asc',
  group: true,
  timediff: true,
}).then(() => {
  // eslint-disable-next-line no-console
  console.log(`\nTest completed.`)
  process.exit(0)
})
