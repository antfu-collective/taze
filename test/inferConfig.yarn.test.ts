import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { inferFromYarn, parseYarnDuration } from '../src/utils/inferConfig/yarn'

const tmpRoots: string[] = []

function makeTmp(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'taze-infer-yarn-'))
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

describe('inferFromYarn', () => {
  let cwd: string

  beforeEach(() => {
    cwd = makeTmp()
  })

  it('reads npmMinimalAgeGate as a duration string', async () => {
    write(cwd, '.yarnrc.yml', 'npmMinimalAgeGate: "3d"\n')
    expect(await inferFromYarn(cwd)).toEqual({
      maturitySet: true,
      maturityPeriod: 3,
      maturityPeriodExclude: [],
    })
  })

  it('reads npmMinimalAgeGate as 60m', async () => {
    write(cwd, '.yarnrc.yml', 'npmMinimalAgeGate: "60m"\n')
    expect((await inferFromYarn(cwd)).maturityPeriod).toBe(60 / 1440)
  })

  it('reads npmMinimalAgeGate as a bare number (minutes)', async () => {
    write(cwd, '.yarnrc.yml', 'npmMinimalAgeGate: 1440\n')
    expect((await inferFromYarn(cwd)).maturityPeriod).toBe(1)
  })

  it('reads npmPreapprovedPackages', async () => {
    write(cwd, '.yarnrc.yml', 'npmMinimalAgeGate: "1d"\nnpmPreapprovedPackages:\n  - react\n  - "@myorg/*"\n')
    expect(await inferFromYarn(cwd)).toEqual({
      maturitySet: true,
      maturityPeriod: 1,
      maturityPeriodExclude: ['react', '@myorg/*'],
    })
  })

  it('is not set when the yaml exists without the field', async () => {
    write(cwd, '.yarnrc.yml', 'nodeLinker: node-modules\n')
    expect(await inferFromYarn(cwd)).toEqual({
      maturitySet: false,
      maturityPeriodExclude: [],
    })
  })

  it('keeps npmPreapprovedPackages even when the gate is unparseable', async () => {
    write(cwd, '.yarnrc.yml', 'npmMinimalAgeGate: 0\nnpmPreapprovedPackages:\n  - react\n')
    expect(await inferFromYarn(cwd)).toEqual({
      maturitySet: false,
      maturityPeriodExclude: ['react'],
    })
  })

  it('finds .yarnrc.yml above cwd', async () => {
    write(cwd, '.yarnrc.yml', 'npmMinimalAgeGate: "2d"\n')
    const deep = path.join(cwd, 'apps', 'web')
    fs.mkdirSync(deep, { recursive: true })
    expect((await inferFromYarn(deep)).maturityPeriod).toBe(2)
  })
})
