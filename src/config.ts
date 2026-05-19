import type { CheckOptions, CommonOptions } from './types'
import process from 'node:process'
import { toArray } from '@antfu/utils'
import _debug from 'debug'
import deepmerge from 'deepmerge'
import { createConfigLoader } from 'unconfig'
import { DEFAULT_CHECK_OPTIONS } from './constants'
import { detectMaturityPeriod } from './utils/detectMaturity'

const debug = _debug('taze:config')

function normalizeConfig(options: CommonOptions) {
  // interop
  if ('default' in options)
    options = options.default as CommonOptions

  options.ignorePaths = toArray(options.ignorePaths)
  options.exclude = toArray(options.exclude)
  options.include = toArray(options.include)

  if (options.silent)
    options.loglevel = 'silent'

  return options
}

export async function resolveConfig(
  options: CommonOptions,
): Promise<CommonOptions> {
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

  let merged: CommonOptions
  if (!config.sources.length) {
    merged = deepmerge(defaults, options)
  }
  else {
    debug(`config file found ${config.sources[0]}`)
    const configOptions = normalizeConfig(config.config)
    merged = deepmerge(deepmerge(defaults, configOptions), options)
  }

  const checkMerged = merged as CheckOptions
  if (checkMerged.maturityPeriod == null && !checkMerged.global) {
    const detected = await detectMaturityPeriod(checkMerged.cwd || process.cwd())
    if (detected != null)
      checkMerged.maturityPeriod = detected
  }

  return merged
}
