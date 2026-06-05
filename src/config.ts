import type { CheckOptions, CommonOptions } from './types'
import process from 'node:process'
import { toArray } from '@antfu/utils'
import _debug from 'debug'
import deepmerge from 'deepmerge'
import { createConfigLoader } from 'unconfig'
import { DEFAULT_CHECK_OPTIONS } from './constants'
import { detectMaturityConfig } from './utils/detectMaturity'

const debug = _debug('taze:config')

function normalizeConfig(options: CommonOptions) {
  // interop
  if ('default' in options)
    options = options.default as CommonOptions

  const checkOptions = options as CheckOptions
  options.ignorePaths = toArray(options.ignorePaths)
  options.exclude = toArray(options.exclude)
  options.include = toArray(options.include)
  checkOptions.maturityPeriodExclude = toArray(checkOptions.maturityPeriodExclude)

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
  if (!checkMerged.global && (checkMerged.maturityPeriod == null || !checkMerged.maturityPeriodExclude?.length)) {
    const detected = await detectMaturityConfig(checkMerged.cwd || process.cwd())
    if (checkMerged.maturityPeriod == null && detected?.maturityPeriod != null)
      checkMerged.maturityPeriod = detected.maturityPeriod
    if (!checkMerged.maturityPeriodExclude?.length && detected?.maturityPeriodExclude.length)
      checkMerged.maturityPeriodExclude = detected.maturityPeriodExclude
  }

  return merged
}
