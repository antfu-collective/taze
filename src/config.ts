import type { CheckOptions, CommonOptions, GitHubActionStyle, RetryOptions } from './types'
import process from 'node:process'
import { toArray } from '@antfu/utils'
import deepmerge from 'deepmerge'
import { createDebug } from 'obug'
import { createConfigLoader } from 'unconfig'
import { DEFAULT_CHECK_OPTIONS } from './constants'
import { inferConfig } from './utils/inferConfig'

const debug = createDebug('taze:config')

/**
 * The raw option shape accepted from the CLI, before normalization.
 *
 * The CLI exposes a few options as flat flags (`--retry`, `--retry-factor`,
 * `--github-actions-style`, ...) that are shaped into their structured
 * `CheckOptions` form by {@link resolveConfig}.
 */
export interface CliOptions extends Omit<CheckOptions, 'retry'> {
  /**
   * `true` for a bare `--retry`, `false` for `--no-retry`, a number for a
   * retry count, or a structured {@link RetryOptions} object.
   */
  retry?: number | boolean | RetryOptions
  retryFactor?: number
  retryMinTimeout?: number
  retryMaxTimeout?: number
  retryRandomize?: boolean
  githubActionsStyle?: GitHubActionStyle
}

/**
 * Fold the CLI's flat flags into their structured `CheckOptions` form and drop
 * the CLI-only keys, so downstream config merging sees a clean `CommonOptions`.
 */
function normalizeCliOptions(input: CliOptions): CommonOptions {
  const {
    retry,
    retryFactor: factor,
    retryMinTimeout: minTimeout,
    retryMaxTimeout: maxTimeout,
    retryRandomize: randomize,
    githubActionsStyle,
    ...rest
  } = input

  const options = rest as CheckOptions

  // assemble retry behavior from `--retry` and the fine-grained `--retry-*` flags
  const hasFineGrained = factor != null || minTimeout != null || maxTimeout != null || randomize != null
  if (retry !== false && hasFineGrained) {
    options.retry = {
      ...(retry != null && typeof retry === 'object' ? retry : {}),
      ...typeof retry === 'number' && { retries: retry },
      ...factor != null && { factor },
      ...minTimeout != null && { minTimeout },
      ...maxTimeout != null && { maxTimeout },
      ...randomize != null && { randomize },
    }
  }
  else if (typeof retry === 'number' || retry === false || (retry != null && typeof retry === 'object')) {
    options.retry = retry
  }
  // a bare `--retry` (`retry === true`) or absent flag falls back to the config
  // file / default retry count, so leave `retry` unset here

  // `--github-actions-style` maps to the structured `githubActions` option,
  // unless GitHub Actions checking is disabled (`--no-github-actions`)
  if (options.githubActions !== false && githubActionsStyle)
    options.githubActions = { style: githubActionsStyle }

  return options
}

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
  options: CliOptions | CommonOptions,
): Promise<CommonOptions> {
  const defaults = DEFAULT_CHECK_OPTIONS
  options = normalizeConfig(normalizeCliOptions(options))

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

  // When DO_NOT_TRACK is set, skip the third-party fast-npm-meta endpoint and
  // use the direct registry client instead. The fast-npm-meta endpoint receives
  // every dependency name in the project, which is a privacy concern an operator
  // may not want. DO_NOT_TRACK is an informal convention that many CLI tools
  // honor: https://donottrack.sh/
  if (process.env.DO_NOT_TRACK) {
    checkMerged.fastNpmMetaApiEndpoint = undefined
  }

  return merged
}
