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

cli
  .command('[mode]', 'Keeps your deps fresh')
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
  .option('--sort <type>', `sort by most outdated absolute or relative to dependency (${SORT_CHOICES.join('|')})`)
  .option('--group', 'group dependencies by source on display')
  .option('--include-locked, -l', 'include locked dependencies & devDependencies')
  .option('--timediff', 'show time difference between the current and the updated version')
  .option('--nodecompat', 'show package compatibility with current node version')
  .option('--peer', 'Include peerDependencies in the update process')
  .option('--maturity-period [days]', 'wait period in days before upgrading to newly released packages (default: 7 when flag is used, 0 when not used)')
  .option('--concurrency', 'number of concurrent requests when resolving dependencies', { default: 10 })
  .action(async (mode: RangeMode | undefined, options: Partial<CheckOptions>) => {
    if (mode) {
      if (!MODE_CHOICES.includes(mode)) {
        console.error(`Invalid mode: ${mode}. Please use one of the following: ${MODE_CHOICES.join('|')}`)
        process.exit(1)
      }
      options.mode = mode
    }

    if ('maturityPeriod' in options && typeof options.maturityPeriod !== 'number') {
      options.maturityPeriod = 7
    }

    const resolved = await resolveConfig(options)

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
