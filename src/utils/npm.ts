// ported from: https://github.com/raineorshine/npm-check-updates/blob/master/lib/package-managers/npm.js

import path from 'path'

// @ts-expect-error missing types
import NpmcliConfig from '@npmcli/config'

type Recordable = Record<string, any>

declare interface NpmcliConfigOptions {
  definitions: Recordable
  npmPath: string
  flatten: (current: Recordable, total: Recordable) => void
}

// eslint-disable-next-line @typescript-eslint/no-redeclare
declare class NpmcliConfig {
  constructor(options: NpmcliConfigOptions)
  load(): Promise<void>
  loadDefaults(): void
  home: string
  globalPrefix: string
  data: Map<string, Recordable>
  get flat(): Recordable
}

const getNpmConfig = async () => {
  const npmcliConfig = new NpmcliConfig({
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

  await npmcliConfig.load()
  return npmcliConfig.flat
}

export { getNpmConfig }
