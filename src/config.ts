import type { CheckOptions, CommonOptions } from './types'
import process from 'node:process'
import { toArray } from '@antfu/utils'
import deepmerge from 'deepmerge'
import { createDebug } from 'obug'
import { createConfigLoader } from 'unconfig'
import { DEFAULT_CHECK_OPTIONS } from './constants'
import { inferConfig } from './utils/inferConfig'

const debug = createDebug('taze:config')

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
  if (!checkMerged.global) {
    const inferred = await inferConfig(checkMerged.cwd || process.cwd())

    // Maturity period is only inferred when the user hasn't set it.
    if (checkMerged.maturityPeriod == null && inferred.maturityPeriod != null)
      checkMerged.maturityPeriod = inferred.maturityPeriod
    if (!checkMerged.maturityPeriodExclude?.length && inferred.maturityPeriodExclude.length)
      checkMerged.maturityPeriodExclude = inferred.maturityPeriodExclude

    // pnpm's update.ignoreDeps / updateConfig.ignoreDependencies mean "never
    // update these packages". Fold them into `exclude` (additive) so they are
    // always honored on top of the user's own config.
    if (inferred.updateIgnores.length) {
      const existing = toArray(checkMerged.exclude)
      checkMerged.exclude = [...new Set([...existing, ...inferred.updateIgnores])]
    }
  }

  return merged
}
