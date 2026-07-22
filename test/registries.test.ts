import process from 'node:process'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getRegistriesEnv } from '../src/utils/registries'

const fixtures = `${process.cwd()}/test/fixtures`

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('custom registries', () => {
  it('reads pnpm-workspace.yaml registries', () => {
    expect(getRegistriesEnv(`${fixtures}/pnpm-registries`)).toEqual({
      'npm_config_registry': 'https://registry.npmjs.org/',
      'npm_config_@my-scope:registry': 'https://npm.example.com/',
      'npm_config_@another:registry': 'https://npm.another.dev/',
    })
  })

  it('reads .yarnrc.yml registries and token auth, expanding env vars', () => {
    vi.stubEnv('TAZE_TEST_YARN_TOKEN', 'secret-yarn')
    expect(getRegistriesEnv(`${fixtures}/yarn-registries`)).toEqual({
      'npm_config_registry': 'https://registry.example.com/',
      'npm_config_@my-company:registry': 'https://npm.mycompany.com/',
      'npm_config_//npm.mycompany.com/:_authToken': 'secret-yarn',
      'npm_config_//npm.pkg.github.com/:_authToken': 'gh-token-abc',
    })
  })

  it('reads bunfig.toml registries and token auth, expanding env vars', () => {
    vi.stubEnv('TAZE_TEST_BUN_TOKEN', 'secret-bun')
    expect(getRegistriesEnv(`${fixtures}/bun-registries`)).toEqual({
      'npm_config_registry': 'https://registry.example.com/',
      'npm_config_@myorg:registry': 'https://npm.myorg.com/',
      'npm_config_//npm.myorg.com/:_authToken': 'secret-bun',
      'npm_config_@another:registry': 'https://npm.another.dev/',
    })
  })

  it('returns an empty map when no custom registries are configured', () => {
    expect(getRegistriesEnv(`${fixtures}/pnpm-catalog`)).toEqual({})
  })
})
