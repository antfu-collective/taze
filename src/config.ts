import process from 'node:process'
import deepmerge from 'deepmerge'
import _debug from 'debug'
import { createConfigLoader } from 'unconfig'
import type { CommonOptions } from './types'
import { toArray } from './utils/toArray'
import { DEFAULT_CHECK_OPTIONS, DEFAULT_USAGE_OPTIONS } from './constants'

const debug = _debug('taze:config')

function normalizeConfig<T extends CommonOptions>(options: T) {
  options.ignorePaths = toArray(options.ignorePaths)
  options.exclude = toArray(options.exclude)
  options.include = toArray(options.include)

  if (options.silent)
    options.loglevel = 'silent'

  return options
}

export async function resolveConfig<T extends CommonOptions>(
  options: T,
  command: 'check' | 'usage',
): Promise<T> {
  const defaultOptions = normalizeConfig(
    command === 'check' ? DEFAULT_CHECK_OPTIONS : DEFAULT_USAGE_OPTIONS,
  )

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
    return deepmerge(defaultOptions, options) as T

  debug(`config file found ${config.sources[0]}`)
  const configOptions = normalizeConfig(config.config)

  return deepmerge(defaultOptions, deepmerge(configOptions, options)) as T
}
