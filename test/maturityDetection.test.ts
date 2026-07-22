import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { detectMaturityConfig, detectMaturityPeriod, parseYarnDuration } from '../src/utils/detectMaturity'

const tmpRoots: string[] = []

function makeTmp(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'taze-maturity-'))
  tmpRoots.push(dir)
  return dir
}

function write(dir: string, relpath: string, content: string) {
  const full = path.join(dir, relpath)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, content, 'utf-8')
}

afterAll(() => {
  for (const dir of tmpRoots)
    fs.rmSync(dir, { recursive: true, force: true })
})

describe('parseYarnDuration', () => {
  it('handles duration strings with unit suffix', () => {
    expect(parseYarnDuration('1d')).toBe(1)
    expect(parseYarnDuration('3d')).toBe(3)
    expect(parseYarnDuration('24h')).toBe(1)
    expect(parseYarnDuration('60m')).toBe(60 / 1440)
    expect(parseYarnDuration('86400s')).toBe(1)
    expect(parseYarnDuration('0.5d')).toBe(0.5)
  })

  it('treats bare numeric strings as minutes', () => {
    expect(parseYarnDuration('1440')).toBe(1)
  })

  it('treats raw numbers as minutes', () => {
    expect(parseYarnDuration(1440)).toBe(1)
    expect(parseYarnDuration(720)).toBe(0.5)
  })

  it('returns undefined for non-positive or invalid input', () => {
    expect(parseYarnDuration('0')).toBeUndefined()
    expect(parseYarnDuration(0)).toBeUndefined()
    expect(parseYarnDuration(-1)).toBeUndefined()
    expect(parseYarnDuration('abc')).toBeUndefined()
    expect(parseYarnDuration('')).toBeUndefined()
    expect(parseYarnDuration('1y')).toBeUndefined()
    expect(parseYarnDuration(null)).toBeUndefined()
    expect(parseYarnDuration(undefined)).toBeUndefined()
    expect(parseYarnDuration({})).toBeUndefined()
  })
})

describe('detectMaturityPeriod', () => {
  let cwd: string

  beforeEach(() => {
    cwd = makeTmp()
  })

  describe('pnpm-workspace.yaml', () => {
    it('reads minimumReleaseAge (minutes -> days)', async () => {
      write(cwd, 'pnpm-workspace.yaml', 'minimumReleaseAge: 1440\n')
      expect(await detectMaturityPeriod(cwd)).toBe(1)
    })

    it('supports fractional days from sub-day minutes', async () => {
      write(cwd, 'pnpm-workspace.yaml', 'minimumReleaseAge: 720\n')
      expect(await detectMaturityPeriod(cwd)).toBe(0.5)
    })

    it('reads minimumReleaseAgeExclude', async () => {
      write(cwd, 'pnpm-workspace.yaml', 'minimumReleaseAge: 1440\nminimumReleaseAgeExclude:\n  - react\n  - "@myorg/*"\n')
      expect(await detectMaturityConfig(cwd)).toEqual({
        maturityPeriod: 1,
        maturityPeriodExclude: ['react', '@myorg/*'],
      })
    })

    it('falls through when minimumReleaseAge is 0', async () => {
      write(cwd, 'pnpm-workspace.yaml', 'minimumReleaseAge: 0\n')
      expect(await detectMaturityPeriod(cwd)).toBeUndefined()
    })

    it('respects minimumReleaseAge 0 over pnpm@11 default', async () => {
      write(cwd, 'package.json', JSON.stringify({ packageManager: 'pnpm@11.0.0' }))
      write(cwd, 'pnpm-workspace.yaml', 'minimumReleaseAge: 0\n')
      expect(await detectMaturityPeriod(cwd)).toBeUndefined()
    })

    it('falls through when the yaml exists without the field', async () => {
      write(cwd, 'pnpm-workspace.yaml', 'packages:\n  - "!**/test/**"\n')
      expect(await detectMaturityPeriod(cwd)).toBeUndefined()
    })
  })

  describe('.yarnrc.yml', () => {
    it('reads npmMinimalAgeGate as a duration string', async () => {
      write(cwd, '.yarnrc.yml', 'npmMinimalAgeGate: "3d"\n')
      expect(await detectMaturityPeriod(cwd)).toBe(3)
    })

    it('reads npmMinimalAgeGate as 60m', async () => {
      write(cwd, '.yarnrc.yml', 'npmMinimalAgeGate: "60m"\n')
      expect(await detectMaturityPeriod(cwd)).toBe(60 / 1440)
    })

    it('reads npmMinimalAgeGate as a bare number (minutes)', async () => {
      write(cwd, '.yarnrc.yml', 'npmMinimalAgeGate: 1440\n')
      expect(await detectMaturityPeriod(cwd)).toBe(1)
    })

    it('reads npmPreapprovedPackages', async () => {
      write(cwd, '.yarnrc.yml', 'npmMinimalAgeGate: "1d"\nnpmPreapprovedPackages:\n  - react\n  - "@myorg/*"\n')
      expect(await detectMaturityConfig(cwd)).toEqual({
        maturityPeriod: 1,
        maturityPeriodExclude: ['react', '@myorg/*'],
      })
    })

    it('falls through when the yaml exists without the field', async () => {
      write(cwd, '.yarnrc.yml', 'nodeLinker: node-modules\n')
      expect(await detectMaturityPeriod(cwd)).toBeUndefined()
    })
  })

  describe('priority between sources', () => {
    it('pnpm-workspace.yaml wins over .yarnrc.yml when both have explicit values', async () => {
      write(cwd, 'pnpm-workspace.yaml', 'minimumReleaseAge: 2880\n')
      write(cwd, '.yarnrc.yml', 'npmMinimalAgeGate: "5d"\n')
      expect(await detectMaturityPeriod(cwd)).toBe(2)
    })

    it('.yarnrc.yml wins over packageManager default', async () => {
      write(cwd, '.yarnrc.yml', 'npmMinimalAgeGate: "3d"\n')
      write(cwd, 'package.json', JSON.stringify({ packageManager: 'pnpm@11.0.0' }))
      expect(await detectMaturityPeriod(cwd)).toBe(3)
    })

    it('falls through pnpm yaml absent value to yarn yaml explicit value', async () => {
      write(cwd, 'pnpm-workspace.yaml', 'packages:\n  - "!**/test/**"\n')
      write(cwd, '.yarnrc.yml', 'npmMinimalAgeGate: "3d"\n')
      expect(await detectMaturityPeriod(cwd)).toBe(3)
    })
  })

  describe('packageManager defaults', () => {
    it('applies pnpm@11 default (1 day)', async () => {
      write(cwd, 'package.json', JSON.stringify({ packageManager: 'pnpm@11.0.0' }))
      expect(await detectMaturityPeriod(cwd)).toBe(1)
    })

    it('applies pnpm@11 default with minimumReleaseAgeExclude', async () => {
      write(cwd, 'package.json', JSON.stringify({ packageManager: 'pnpm@11.0.0' }))
      write(cwd, 'pnpm-workspace.yaml', 'minimumReleaseAgeExclude:\n  - react\n')
      expect(await detectMaturityConfig(cwd)).toEqual({
        maturityPeriod: 1,
        maturityPeriodExclude: ['react'],
      })
    })

    it('tolerates pnpm hash suffix in packageManager', async () => {
      write(cwd, 'package.json', JSON.stringify({ packageManager: 'pnpm@11.2.0+sha512.abc' }))
      expect(await detectMaturityPeriod(cwd)).toBe(1)
    })

    it('returns undefined for pnpm@10', async () => {
      write(cwd, 'package.json', JSON.stringify({ packageManager: 'pnpm@10.33.4' }))
      expect(await detectMaturityPeriod(cwd)).toBeUndefined()
    })

    it('applies yarn@4.12 default', async () => {
      write(cwd, 'package.json', JSON.stringify({ packageManager: 'yarn@4.12.0' }))
      expect(await detectMaturityPeriod(cwd)).toBe(1)
    })

    it('applies yarn@4.12 default with npmPreapprovedPackages', async () => {
      write(cwd, 'package.json', JSON.stringify({ packageManager: 'yarn@4.12.0' }))
      write(cwd, '.yarnrc.yml', 'npmPreapprovedPackages:\n  - react\n')
      expect(await detectMaturityConfig(cwd)).toEqual({
        maturityPeriod: 1,
        maturityPeriodExclude: ['react'],
      })
    })

    it('returns undefined for yarn@4.11', async () => {
      write(cwd, 'package.json', JSON.stringify({ packageManager: 'yarn@4.11.0' }))
      expect(await detectMaturityPeriod(cwd)).toBeUndefined()
    })

    it('applies yarn@5 default (above threshold)', async () => {
      write(cwd, 'package.json', JSON.stringify({ packageManager: 'yarn@5.0.0' }))
      expect(await detectMaturityPeriod(cwd)).toBe(1)
    })

    it('returns undefined for yarn@3', async () => {
      write(cwd, 'package.json', JSON.stringify({ packageManager: 'yarn@3.6.0' }))
      expect(await detectMaturityPeriod(cwd)).toBeUndefined()
    })

    it('returns undefined when packageManager is absent', async () => {
      write(cwd, 'package.json', JSON.stringify({ name: 'demo' }))
      expect(await detectMaturityPeriod(cwd)).toBeUndefined()
    })

    it('returns undefined when no package.json exists upstream', async () => {
      // tmp dir under /tmp doesn't have a package.json walking up to /
      expect(await detectMaturityPeriod(cwd)).toBeUndefined()
    })

    it('returns undefined for non-pnpm/yarn package managers', async () => {
      write(cwd, 'package.json', JSON.stringify({ packageManager: 'npm@11.0.0' }))
      expect(await detectMaturityPeriod(cwd)).toBeUndefined()
    })

    it('reads devEngines.packageManager when packageManager field is absent', async () => {
      write(cwd, 'package.json', JSON.stringify({
        devEngines: { packageManager: { name: 'pnpm', version: '11.0.0' } },
      }))
      expect(await detectMaturityPeriod(cwd)).toBe(1)
    })
  })

  describe('walk-up behavior', () => {
    it('finds pnpm-workspace.yaml above cwd', async () => {
      write(cwd, 'pnpm-workspace.yaml', 'minimumReleaseAge: 1440\n')
      const deep = path.join(cwd, 'packages', 'foo', 'src')
      fs.mkdirSync(deep, { recursive: true })
      expect(await detectMaturityPeriod(deep)).toBe(1)
    })

    it('finds .yarnrc.yml above cwd', async () => {
      write(cwd, '.yarnrc.yml', 'npmMinimalAgeGate: "2d"\n')
      const deep = path.join(cwd, 'apps', 'web')
      fs.mkdirSync(deep, { recursive: true })
      expect(await detectMaturityPeriod(deep)).toBe(2)
    })

    it('walks past a sub-package package.json without packageManager to the monorepo root', async () => {
      write(cwd, 'package.json', JSON.stringify({ packageManager: 'pnpm@11.0.0' }))
      const leafDir = path.join(cwd, 'packages', 'foo')
      write(leafDir, 'package.json', JSON.stringify({ name: '@demo/foo' }))
      expect(await detectMaturityPeriod(leafDir)).toBe(1)
    })

    it('uses the closest packageManager declaration when nested', async () => {
      // outer says pnpm@11 (1 day), inner says yarn@4.11 (undefined)
      // we expect inner to win since walk-up stops at the first packageManager match
      write(cwd, 'package.json', JSON.stringify({ packageManager: 'pnpm@11.0.0' }))
      const inner = path.join(cwd, 'sub')
      write(inner, 'package.json', JSON.stringify({ packageManager: 'yarn@4.11.0' }))
      expect(await detectMaturityPeriod(inner)).toBeUndefined()
    })
  })
})
