// ported from: https://github.com/raineorshine/npm-check-updates/blob/master/lib/package-managers/npm.js

import path from 'node:path'
import process from 'node:process'
import type { Recordable } from '@npmcli/config'

async function _getNpmConfig() {
  const { default: NpmCliConfig } = await import('@npmcli/config')
  const npmcliConfig = new NpmCliConfig({
    definitions: {},
    npmPath: path.dirname(process.cwd()),
    flatten: (current, total) => {
      Object.assign(total, current)
    },
  })

  // patch loadDefaults to set defaults of userconfig and globalconfig
  const oldLoadDefaults = npmcliConfig.loadDefaults.bind(npmcliConfig)
  npmcliConfig.loadDefaults = () => {
    oldLoadDefaults()

    const setCliOption = (key: string, value: any) => {
      const cli = npmcliConfig.data.get('cli')
      if (cli)
        cli.data[key] = value
    }
    setCliOption('userconfig', path.join(npmcliConfig.home, '.npmrc'))
    setCliOption('globalconfig', path.join(npmcliConfig.globalPrefix, 'etc', 'npmrc'))
  }

  // npmcliConfig.load() would set unnecessary environment variables
  // that would cause install global packages not to work on macOS Homebrew.
  // so we have to do copy old environment variables to new environment
  const oldEnv = { ...process.env }
  await npmcliConfig.load()
  process.env = oldEnv
  return npmcliConfig.flat
}

let _cache: Promise<Recordable> | undefined

export function getNpmConfig() {
  if (!_cache)
    _cache = _getNpmConfig()
  return _cache
}
