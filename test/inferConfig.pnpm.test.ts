import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { inferFromPnpm } from '../src/utils/inferConfig/pnpm'

const tmpRoots: string[] = []

function makeTmp(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'taze-infer-pnpm-'))
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

describe('inferFromPnpm', () => {
  let cwd: string

  beforeEach(() => {
    cwd = makeTmp()
  })

  describe('maturity', () => {
    it('reads minimumReleaseAge (minutes -> days)', async () => {
      write(cwd, 'pnpm-workspace.yaml', 'minimumReleaseAge: 1440\n')
      expect(await inferFromPnpm(cwd)).toEqual({
        maturitySet: true,
        maturityPeriod: 1,
        maturityPeriodExclude: [],
        updateIgnores: [],
      })
    })

    it('supports fractional days from sub-day minutes', async () => {
      write(cwd, 'pnpm-workspace.yaml', 'minimumReleaseAge: 720\n')
      expect((await inferFromPnpm(cwd)).maturityPeriod).toBe(0.5)
    })

    it('reads minimumReleaseAgeExclude', async () => {
      write(cwd, 'pnpm-workspace.yaml', 'minimumReleaseAge: 1440\nminimumReleaseAgeExclude:\n  - react\n  - "@myorg/*"\n')
      expect(await inferFromPnpm(cwd)).toEqual({
        maturitySet: true,
        maturityPeriod: 1,
        maturityPeriodExclude: ['react', '@myorg/*'],
        updateIgnores: [],
      })
    })

    it('marks maturity as set but disabled when minimumReleaseAge is 0', async () => {
      write(cwd, 'pnpm-workspace.yaml', 'minimumReleaseAge: 0\n')
      expect(await inferFromPnpm(cwd)).toEqual({
        maturitySet: true,
        maturityPeriod: undefined,
        maturityPeriodExclude: [],
        updateIgnores: [],
      })
    })

    it('is not set when the yaml exists without the field', async () => {
      write(cwd, 'pnpm-workspace.yaml', 'packages:\n  - "!**/test/**"\n')
      expect(await inferFromPnpm(cwd)).toEqual({
        maturitySet: false,
        maturityPeriodExclude: [],
        updateIgnores: [],
      })
    })

    it('is not set when no pnpm-workspace.yaml exists', async () => {
      expect(await inferFromPnpm(cwd)).toEqual({
        maturitySet: false,
        maturityPeriodExclude: [],
        updateIgnores: [],
      })
    })
  })

  describe('updateIgnores', () => {
    it('reads updateConfig.ignoreDependencies (pnpm 10.x)', async () => {
      write(cwd, 'pnpm-workspace.yaml', 'updateConfig:\n  ignoreDependencies:\n    - load-json-file\n    - "@babel/*"\n')
      expect((await inferFromPnpm(cwd)).updateIgnores).toEqual(['load-json-file', '@babel/*'])
    })

    it('reads update.ignoreDeps (pnpm 11 & 12)', async () => {
      write(cwd, 'pnpm-workspace.yaml', 'update:\n  ignoreDeps:\n    - react\n    - react-dom\n')
      expect((await inferFromPnpm(cwd)).updateIgnores).toEqual(['react', 'react-dom'])
    })

    it('unions and dedupes both keys (update.ignoreDeps first)', async () => {
      write(cwd, 'pnpm-workspace.yaml', 'updateConfig:\n  ignoreDependencies:\n    - react\n    - vue\nupdate:\n  ignoreDeps:\n    - vue\n    - svelte\n')
      expect((await inferFromPnpm(cwd)).updateIgnores).toEqual(['vue', 'svelte', 'react'])
    })

    it('ignores non-string junk entries', async () => {
      write(cwd, 'pnpm-workspace.yaml', 'updateConfig:\n  ignoreDependencies:\n    - react\n    - 123\n    - true\n')
      expect((await inferFromPnpm(cwd)).updateIgnores).toEqual(['react'])
    })

    it('is empty when the yaml exists without the fields', async () => {
      write(cwd, 'pnpm-workspace.yaml', 'packages:\n  - "packages/*"\n')
      expect((await inferFromPnpm(cwd)).updateIgnores).toEqual([])
    })
  })

  describe('walk-up behavior', () => {
    it('finds pnpm-workspace.yaml above cwd', async () => {
      write(cwd, 'pnpm-workspace.yaml', 'minimumReleaseAge: 1440\nupdate:\n  ignoreDeps:\n    - react\n')
      const deep = path.join(cwd, 'packages', 'foo', 'src')
      fs.mkdirSync(deep, { recursive: true })
      const inferred = await inferFromPnpm(deep)
      expect(inferred.maturityPeriod).toBe(1)
      expect(inferred.updateIgnores).toEqual(['react'])
    })
  })
})
