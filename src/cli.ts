import process from 'node:process'
import type { Argv } from 'yargs'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import c from 'picocolors'
import { version } from '../package.json'
import { check } from './commands/check'
import { usage } from './commands/usage'
import type { CommonOptions, LogLevel, RangeMode } from './types'
import { SORT_CHOICES } from './utils/sort'
import { resolveConfig } from './config'
import type { SortOption } from './utils/sort'
import { checkGlobal } from './commands/check/checkGlobal'
import { DEFAULT_CHECK_OPTIONS, DEFAULT_USAGE_OPTIONS, LOG_LEVELS, MODE_CHOICES } from './constants'

function removeDefaultConfig<T extends CommonOptions>(options: T, defaults: T) {
  return Object.fromEntries(
    Object.entries(options)
      .filter(([key, value]) =>
        key in defaults && value !== defaults[key as keyof T],
      ),
  ) as T
}

function commonOptions(args: Argv<object>): Argv<CommonOptions> {
  return args
    .option('cwd', {
      alias: 'C',
      default: '',
      type: 'string',
      describe: 'specify the current working directory',
    })
    .option('loglevel', {
      default: 'info' as LogLevel,
      type: 'string',
      describe: 'log level',
      choices: LOG_LEVELS,
    })
    .option('failOnOutdated', {
      type: 'boolean',
      describe: 'exit with code 1 if outdated dependencies are found',
    })
    .option('silent', {
      alias: 's',
      default: false,
      type: 'boolean',
      describe: 'complete silent',
    })
    .option('recursive', {
      alias: 'r',
      type: 'boolean',
      describe: 'recursively search for package.json in subdirectories',
    })
    .option('force', {
      alias: 'f',
      type: 'boolean',
      describe: 'force fetching from server, bypass cache',
    })
    .option('ignore-paths', {
      type: 'string',
      describe: 'ignore paths for search package.json',
    })
    .option('include', {
      alias: 'n',
      type: 'string',
      describe: 'only included dependencies will be checked for updates',
    })
    .option('exclude', {
      alias: 'x',
      type: 'string',
      describe: 'exclude dependencies to be checked, will override --include options',
    })
    .option('dev', {
      alias: 'D',
      type: 'boolean',
      describe: 'update only for devDependencies',
      conflicts: ['prod'],
    })
    .option('prod', {
      alias: 'P',
      type: 'boolean',
      describe: 'update only for dependencies',
      conflicts: ['dev'],
    })
}

// eslint-disable-next-line no-unused-expressions
yargs(hideBin(process.argv))
  .scriptName('taze')
  .usage('$0 [args]')
  .command(
    'usage',
    'List dependencies versions usage across packages',
    (args) => {
      return commonOptions(args)
        .option('detail', {
          alias: 'a',
          type: 'boolean',
          default: false,
          describe: 'show more info',
        })
        .help()
        .demandOption('recursive', c.yellow('Please add -r to analysis usages'))
    },
    async args => usage(await resolveConfig(
      removeDefaultConfig(
        { ...args, recursive: true },
        DEFAULT_USAGE_OPTIONS,
      ),
      'usage',
    )),
  )
  .command(
    '* [mode]',
    'Keeps your deps fresh',
    (args) => {
      return commonOptions(args)
        .positional('mode', {
          default: 'default' as RangeMode,
          type: 'string',
          describe: 'the mode how version range resolves, can be "default", "major", "minor", "latest" or "newest"',
          choices: MODE_CHOICES,
        })
        .option('write', {
          alias: 'w',
          default: false,
          type: 'boolean',
          describe: 'write to package.json',
        })
        .option('global', {
          alias: 'g',
          default: false,
          type: 'boolean',
          describe: 'update global packages',
        })
        .option('interactive', {
          alias: 'I',
          default: false, // TODO: enable by default: !process.env.CI && process.stdout.isTTY,
          type: 'boolean',
          describe: 'interactive mode',
        })
        .option('install', {
          alias: 'i',
          default: false,
          type: 'boolean',
          describe: 'install directly after bumping',
        })
        .option('update', {
          alias: 'u',
          default: false,
          type: 'boolean',
          describe: 'update directly after bumping',
        })
        .option('all', {
          alias: 'a',
          default: false,
          type: 'boolean',
          describe: 'show all packages up to date info',
        })
        .option('sort', {
          type: 'string',
          default: 'diff-asc' as SortOption,
          choices: SORT_CHOICES,
          describe: 'sort by most outdated absolute or relative to dependency',
        })
        .option('include-locked', {
          alias: 'l',
          type: 'boolean',
          describe: 'include locked dependencies & devDependencies',
        })
        .help()
    },
    async (args) => {
      let exitCode
      const config = await resolveConfig(
        removeDefaultConfig(args, DEFAULT_CHECK_OPTIONS),
        'check',
      )
      if (args.global)
        exitCode = await checkGlobal(config)
      else
        exitCode = await check(config)

      process.exit(exitCode)
    },
  )
  .showHelpOnFail(false)
  .alias('h', 'help')
  .version('version', version)
  .alias('v', 'version')
  .help()
  .argv
