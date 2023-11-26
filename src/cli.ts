import process from 'node:process'
import type { Argv } from 'yargs'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import c from 'picocolors'
import { version } from '../package.json'
import { check } from './commands/check'
import { usage } from './commands/usage'
import { resolveConfig } from './config'
import { LOG_LEVELS, MODE_CHOICES } from './constants'
import type { CommonOptions } from './types'
import { SORT_CHOICES } from './utils/sort'
import { checkGlobal } from './commands/check/checkGlobal'

function commonOptions(args: Argv<object>): Argv<CommonOptions> {
  return args
    .option('cwd', {
      alias: 'C',
      type: 'string',
      describe: 'specify the current working directory',
    })
    .option('loglevel', {
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
          describe: 'show more info',
        })
        .help()
        .demandOption('recursive', c.yellow('Please add -r to analysis usages'))
    },
    async args => usage(await resolveConfig({ ...args, recursive: true })),
  )
  .command(
    '* [mode]',
    'Keeps your deps fresh',
    (args) => {
      return commonOptions(args)
        .positional('mode', {
          type: 'string',
          describe: 'the mode how version range resolves, can be "default", "major", "minor", "latest" or "newest"',
          choices: MODE_CHOICES,
        })
        .option('write', {
          alias: 'w',
          type: 'boolean',
          describe: 'write to package.json',
        })
        .option('global', {
          alias: 'g',
          type: 'boolean',
          describe: 'update global packages',
        })
        .option('interactive', {
          alias: 'I',
          type: 'boolean',
          describe: 'interactive mode',
        })
        .option('install', {
          alias: 'i',
          type: 'boolean',
          describe: 'install directly after bumping',
        })
        .option('update', {
          alias: 'u',
          type: 'boolean',
          describe: 'update directly after bumping',
        })
        .option('all', {
          alias: 'a',
          type: 'boolean',
          describe: 'show all packages up to date info',
        })
        .option('sort', {
          type: 'string',
          choices: SORT_CHOICES,
          describe: 'sort by most outdated absolute or relative to dependency',
        })
        .option('includeLocked', {
          alias: 'l',
          type: 'boolean',
          describe: 'include locked dependencies & devDependencies',
        })
        .help()
    },
    async (args) => {
      let exitCode
      if (args.global)
        exitCode = await checkGlobal(await resolveConfig(args))
      else
        exitCode = await check(await resolveConfig(args))

      process.exit(exitCode)
    },
  )
  .showHelpOnFail(false)
  .alias('h', 'help')
  .version('version', version)
  .alias('v', 'version')
  .help()
  .argv
