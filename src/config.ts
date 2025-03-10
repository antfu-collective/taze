import type { CommonOptions } from './types'
import process from 'node:process'
import { toArray } from '@antfu/utils'
import _debug from 'debug'
import deepmerge from 'deepmerge'
import { createConfigLoader } from 'unconfig'
import { DEFAULT_CHECK_OPTIONS } from './constants'

const debug = _debug('taze:config')

function normalizeConfig<T extends CommonOptions>(options: T) {
  // interop
  if ('default' in options)
    options = options.default as T

  options.ignorePaths = toArray(options.ignorePaths)
  options.exclude = toArray(options.exclude)
  options.include = toArray(options.include)

  if (options.silent)
    options.loglevel = 'silent'

  return options
}

export async function resolveConfig<T extends CommonOptions>(
  options: T,
): Promise<T> {
  const defaults = DEFAULT_CHECK_OPTIONS
  options = normalizeConfig(options)

  const loader = createConfigLoader<CommonOptions>({
    sources: [
      {
        files: [
          'taze.config',
        ],
      },
      {
        files: [
          '.tazerc',
        ],
        extensions: ['json', ''],
      },
    ],
    cwd: options.cwd || process.cwd(),
    merge: false,
  })

  const config = await loader.load()

  if (!config.sources.length)
    return deepmerge(defaults, options as T) as T

  debug(`config file found ${config.sources[0]}`)
  const configOptions = normalizeConfig(config.config)

  return deepmerge(deepmerge(defaults, configOptions), options as T) as T
}
