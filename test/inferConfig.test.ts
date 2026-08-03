import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { inferConfig } from '../src/utils/inferConfig'

const tmpRoots: string[] = []

function makeTmp(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'taze-infer-'))
  tmpRoots.push(dir)
  return dir
}

function write(dir: string, relpath: string, content: string) {
  const full = path.join(dir, relpath)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, content, 'utf-8')
}

async function period(cwd: string): Promise<number | undefined> {
  return (await inferConfig(cwd)).maturityPeriod
}

afterAll(() => {
  for (const dir of tmpRoots)
    fs.rmSync(dir, { recursive: true, force: true })
})

describe('inferConfig orchestration', () => {
  let cwd: string

  beforeEach(() => {
    cwd = makeTmp()
  })

  it('returns empty defaults when nothing is inferable', async () => {
    expect(await inferConfig(cwd)).toEqual({
      maturityPeriodExclude: [],
      updateIgnores: [],
    })
  })

  describe('maturity priority', () => {
    it('pnpm-workspace.yaml wins over .yarnrc.yml when both have explicit values', async () => {
      write(cwd, 'pnpm-workspace.yaml', 'minimumReleaseAge: 2880\n')
      write(cwd, '.yarnrc.yml', 'npmMinimalAgeGate: "5d"\n')
      expect(await period(cwd)).toBe(2)
    })

    it('.yarnrc.yml wins over packageManager default', async () => {
      write(cwd, '.yarnrc.yml', 'npmMinimalAgeGate: "3d"\n')
      write(cwd, 'package.json', JSON.stringify({ packageManager: 'pnpm@11.0.0' }))
      expect(await period(cwd)).toBe(3)
    })

    it('falls through pnpm yaml absent value to yarn yaml explicit value', async () => {
      write(cwd, 'pnpm-workspace.yaml', 'packages:\n  - "!**/test/**"\n')
      write(cwd, '.yarnrc.yml', 'npmMinimalAgeGate: "3d"\n')
      expect(await period(cwd)).toBe(3)
    })

    it('respects minimumReleaseAge 0 over pnpm@11 default', async () => {
      write(cwd, 'package.json', JSON.stringify({ packageManager: 'pnpm@11.0.0' }))
      write(cwd, 'pnpm-workspace.yaml', 'minimumReleaseAge: 0\n')
      expect(await period(cwd)).toBeUndefined()
    })
  })

  describe('packageManager defaults', () => {
    it('applies pnpm@11 default (1 day)', async () => {
      write(cwd, 'package.json', JSON.stringify({ packageManager: 'pnpm@11.0.0' }))
      expect(await period(cwd)).toBe(1)
    })

    it('applies pnpm@11 default with minimumReleaseAgeExclude', async () => {
      write(cwd, 'package.json', JSON.stringify({ packageManager: 'pnpm@11.0.0' }))
      write(cwd, 'pnpm-workspace.yaml', 'minimumReleaseAgeExclude:\n  - react\n')
      expect(await inferConfig(cwd)).toEqual({
        maturityPeriod: 1,
        maturityPeriodExclude: ['react'],
        updateIgnores: [],
      })
    })

    it('tolerates pnpm hash suffix in packageManager', async () => {
      write(cwd, 'package.json', JSON.stringify({ packageManager: 'pnpm@11.2.0+sha512.abc' }))
      expect(await period(cwd)).toBe(1)
    })

    it('returns undefined for pnpm@10', async () => {
      write(cwd, 'package.json', JSON.stringify({ packageManager: 'pnpm@10.33.4' }))
      expect(await period(cwd)).toBeUndefined()
    })

    it('applies yarn@4.12 default', async () => {
      write(cwd, 'package.json', JSON.stringify({ packageManager: 'yarn@4.12.0' }))
      expect(await period(cwd)).toBe(1)
    })

    it('applies yarn@4.12 default with npmPreapprovedPackages', async () => {
      write(cwd, 'package.json', JSON.stringify({ packageManager: 'yarn@4.12.0' }))
      write(cwd, '.yarnrc.yml', 'npmPreapprovedPackages:\n  - react\n')
      expect(await inferConfig(cwd)).toEqual({
        maturityPeriod: 1,
        maturityPeriodExclude: ['react'],
        updateIgnores: [],
      })
    })

    it('returns undefined for yarn@4.11', async () => {
      write(cwd, 'package.json', JSON.stringify({ packageManager: 'yarn@4.11.0' }))
      expect(await period(cwd)).toBeUndefined()
    })

    it('applies yarn@5 default (above threshold)', async () => {
      write(cwd, 'package.json', JSON.stringify({ packageManager: 'yarn@5.0.0' }))
      expect(await period(cwd)).toBe(1)
    })

    it('returns undefined for yarn@3', async () => {
      write(cwd, 'package.json', JSON.stringify({ packageManager: 'yarn@3.6.0' }))
      expect(await period(cwd)).toBeUndefined()
    })

    it('returns undefined when packageManager is absent', async () => {
      write(cwd, 'package.json', JSON.stringify({ name: 'demo' }))
      expect(await period(cwd)).toBeUndefined()
    })

    it('returns undefined when no package.json exists upstream', async () => {
      expect(await period(cwd)).toBeUndefined()
    })

    it('returns undefined for non-pnpm/yarn package managers', async () => {
      write(cwd, 'package.json', JSON.stringify({ packageManager: 'npm@11.0.0' }))
      expect(await period(cwd)).toBeUndefined()
    })

    it('reads devEngines.packageManager when packageManager field is absent', async () => {
      write(cwd, 'package.json', JSON.stringify({
        devEngines: { packageManager: { name: 'pnpm', version: '11.0.0' } },
      }))
      expect(await period(cwd)).toBe(1)
    })
  })

  describe('walk-up behavior', () => {
    it('walks past a sub-package package.json without packageManager to the monorepo root', async () => {
      write(cwd, 'package.json', JSON.stringify({ packageManager: 'pnpm@11.0.0' }))
      const leafDir = path.join(cwd, 'packages', 'foo')
      write(leafDir, 'package.json', JSON.stringify({ name: '@demo/foo' }))
      expect(await period(leafDir)).toBe(1)
    })

    it('uses the closest packageManager declaration when nested', async () => {
      // outer says pnpm@11 (1 day), inner says yarn@4.11 (undefined)
      write(cwd, 'package.json', JSON.stringify({ packageManager: 'pnpm@11.0.0' }))
      const inner = path.join(cwd, 'sub')
      write(inner, 'package.json', JSON.stringify({ packageManager: 'yarn@4.11.0' }))
      expect(await period(inner)).toBeUndefined()
    })
  })

  describe('updateIgnores', () => {
    it('surfaces pnpm update ignores alongside maturity', async () => {
      write(cwd, 'pnpm-workspace.yaml', 'minimumReleaseAge: 1440\nupdate:\n  ignoreDeps:\n    - react\n')
      expect(await inferConfig(cwd)).toEqual({
        maturityPeriod: 1,
        maturityPeriodExclude: [],
        updateIgnores: ['react'],
      })
    })
  })
})
