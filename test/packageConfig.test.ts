import process from 'node:process'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { CheckOptions, CommonOptions, ResolvedDepChange } from '../src'
import { CheckPackages } from '../src'
import { resolveConfig } from '../src/config'

function getPkgInfo(name: string, result: ResolvedDepChange[]) {
  return result.filter(r => r.name === name)[0]
}

beforeAll(() => {
  process.env.IMPORTX_LOADER = 'jiti'
})

afterAll(() => {
  delete process.env.IMPORTX_LOADER
})

describe('load config', () => {
  it('with packagemode', async () => {
    const options: CommonOptions = {
      cwd: join(process.cwd(), 'test/fixtures/pkgmode'),
      loglevel: 'silent',
    }
    const { packageMode } = await resolveConfig(options)
    expect(packageMode).toMatchInlineSnapshot(`
      {
        "/vue/": "latest",
        "typescript": "major",
        "unocss": "ignore",
      }
    `)
  })

  it('without packagemode', async () => {
    const options: CommonOptions = {
      cwd: process.cwd(),
      loglevel: 'silent',
    }
    const { packageMode } = await resolveConfig(options)
    expect(packageMode).toMatchInlineSnapshot('undefined')
  })
})

describe('check package', async () => {
  // option.mode = default
  const options: CheckOptions = {
    cwd: `${process.cwd()}/test/fixtures/pkgmode`,
    loglevel: 'silent',
    mode: 'default',
    packageMode: {
      'typescript': 'major',
      '/vue/': 'minor',
      'vite': 'ignore',
    },
    write: false,
    all: false,
  }
  const result = (await CheckPackages(options, {})).packages[0].resolved
  it('not defined in config file / optionMode:default', () => {
    expect(getPkgInfo('express', result).update).toBe(true)
  })

  it('defined in config file / optionMode:default', () => {
    expect(getPkgInfo('typescript', result).update).toBe(true)
    expect(getPkgInfo('typescript', result).diff).toBe('major')

    expect(getPkgInfo('vue', result).update).toBe(true)
    expect(getPkgInfo('vue', result).diff).toBe('minor')

    expect(getPkgInfo('vite', result).update).toBe(false)
  })

  // regex
  it('defined in config file[regex] / optionMode:default', () => {
    expect(getPkgInfo('vue-router', result).update).toBe(true)
    expect(getPkgInfo('vue-router', result).diff).toBe('minor')
  })

  // option.mode = major
  options.mode = 'major'
  const result2 = (await CheckPackages(options, {})).packages[0].resolved
  it('not defined in config file / optionMode:major', () => {
    expect(getPkgInfo('express', result2).update).toBe(true)
    expect(getPkgInfo('express', result2).diff).toBe('major')
  })

  it('defined in config file / optionMode:major', () => {
    expect(getPkgInfo('typescript', result2).update).toBe(true)
    expect(getPkgInfo('typescript', result2).diff).toBe('major')

    expect(getPkgInfo('vue', result2).update).toBe(false)
    expect(getPkgInfo('vite', result2).update).toBe(false)
  })

  // option.mode = minor
  options.mode = 'minor'
  const result3 = (await CheckPackages(options, {})).packages[0].resolved
  it('not defined in config file / optionMode:minor', () => {
    expect(getPkgInfo('express', result3).update).toBe(true)
  })

  it('defined in config file / optionMode:minor', () => {
    expect(getPkgInfo('typescript', result3).update).toBe(false)

    expect(getPkgInfo('vue', result3).update).toBe(true)
    expect(getPkgInfo('vue', result3).diff).toBe('minor')

    expect(getPkgInfo('vite', result3).update).toBe(false)
  })

  // option.mode = newest
  options.mode = 'newest'
  const result4 = (await CheckPackages(options, {})).packages[0].resolved
  it('not defined in config file / optionMode:newest', () => {
    expect(getPkgInfo('express', result4).update).toBe(true)
  })

  it('defined in config file / optionMode:newest', () => {
    expect(getPkgInfo('typescript', result4).update).toBe(false)
    expect(getPkgInfo('vue', result4).update).toBe(false)
    expect(getPkgInfo('vite', result4).update).toBe(false)
  })
})
