import type { CAC } from 'cac'
import type { CheckOptions, RangeMode } from './types'
import process from 'node:process'
import { cac } from 'cac'
import restoreCursor from 'restore-cursor'
import pkgJson from '../package.json'
import { check } from './commands/check'
import { checkGlobal } from './commands/check/checkGlobal'
import { resolveConfig } from './config'
import { LOG_LEVELS, MODE_CHOICES } from './constants'
import { SORT_CHOICES } from './utils/sort'

const cli: CAC = cac('taze')

interface CliResolvedOption extends Omit<CheckOptions, 'retry'> {
  /**
   * `true` for a bare `--retry`, `false` for `--no-retry`
   */
  retry?: number | boolean
  retryFactor?: number
  retryMinTimeout?: number
  retryMaxTimeout?: number
  retryRandomize?: boolean
}

function resolveRetryOptions(options: CliResolvedOption): CheckOptions {
  const {
    retry,
    retryFactor: factor,
    retryMinTimeout: minTimeout,
    retryMaxTimeout: maxTimeout,
    retryRandomize: randomize,
    ...resolved
  } = options

  if (retry !== false && (factor != null || minTimeout != null || maxTimeout != null || randomize != null)) {
    // assemble the fine-grained `--retry-*` flags into a retry options object
    return {
      ...resolved,
      retry: {
        ...typeof retry === 'number' && { retries: retry },
        ...factor != null && { factor },
        ...minTimeout != null && { minTimeout },
        ...maxTimeout != null && { maxTimeout },
        ...randomize != null && { randomize },
      },
    }
  }

  if (typeof retry === 'number' || retry === false)
    return { ...resolved, retry }

  // a bare `--retry` (`retry === true`) means "enabled",
  // fall back to the config file / default count
  return resolved
}

cli
  .command('[mode]', `Update mode (version range to check). Available: ${MODE_CHOICES.join(' | ')}`)
  .option('--cwd, -C <cwd>', 'specify the current working directory')
  .option('--loglevel <level>', `log level (${LOG_LEVELS.join('|')})`)
  .option('--fail-on-outdated', 'exit with code 1 if outdated dependencies are found')
  .option('--silent, -s', 'complete silent')
  .option('--recursive, -r', 'recursively search for package.json in subdirectories')
  .option('--force, -f', 'force fetching from server, bypass cache')
  .option('--ignore-paths <paths>', 'ignore paths for search package.json')
  .option('--ignore-other-workspaces', 'ignore package.json that in other workspaces (with their own .git,pnpm-workspace.yaml,etc.)', { default: true })
  .option('--include, -n <deps>', 'only included dependencies will be checked for updates')
  .option('--exclude, -x <deps>', 'exclude dependencies to be checked, will override --include options')
  .option('--write, -w', 'write to package.json')
  .option('--global, -g', 'update global packages')
  .option('--interactive, -I', 'interactive mode')
  .option('--install, -i', 'install directly after bumping')
  .option('--update, -u', 'update directly after bumping')
  .option('--all, -a', 'show all packages up to date info')
  .option('--json', 'output update info as JSON (implies non-interactive)')
  .option('--sort <type>', `sort by most outdated absolute or relative to dependency (${SORT_CHOICES.join('|')})`)
  .option('--group', 'group dependencies by source on display')
  .option('--include-locked, -l', 'include locked dependencies & devDependencies')
  .option('--timediff', 'show time difference between the current and the updated version')
  .option('--nodecompat', 'show package compatibility with current node version')
  .option('--peer', 'Include peerDependencies in the update process')
  .option('--maturity-period [days]', 'wait period in days before upgrading to newly released packages (default: 7 when flag is used, 0 when not used)')
  .option('--maturity-period-exclude <deps>', 'dependencies to exclude from the maturity period filter')
  .option('--concurrency <requests>', 'number of concurrent requests when resolving dependencies', { default: 10 })
  .option('--request-timeout <ms>', 'request timeout in milliseconds when fetching package metadata', { default: 5000 })
  .option('--retry [times]', 'number of retries when fetching package metadata fails, use --no-retry to disable (default: 4)')
  .option('--retry-factor <factor>', 'exponential backoff factor between retries (default: 2)')
  .option('--retry-min-timeout <ms>', 'milliseconds before starting the first retry (default: 1000)')
  .option('--retry-max-timeout <ms>', 'maximum milliseconds between two retries (default: Infinity)')
  .option('--retry-randomize', 'randomize retry timeouts by a factor between 1 and 2')
  .action(async (mode: RangeMode | undefined, options: CliResolvedOption) => {
    if (mode) {
      if (!MODE_CHOICES.includes(mode)) {
        console.error(`Invalid mode: ${mode}. Please use one of the following: ${MODE_CHOICES.join(' | ')}`)
        process.exit(1)
      }
      options.mode = mode
    }

    if ('maturityPeriod' in options && typeof options.maturityPeriod !== 'number') {
      options.maturityPeriod = 7
    }

    const resolved = await resolveConfig(resolveRetryOptions(options))

    let exitCode
    if (options.global)
      exitCode = await checkGlobal(resolved)
    else
      exitCode = await check(resolved)

    process.exit(exitCode)
  })

cli.help()
cli.version(pkgJson.version)

cli.parse()

restoreCursor()
