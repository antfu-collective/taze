import type { Argv } from 'yargs'
import type { CommonOptions } from './types'
import process from 'node:process'
import c from 'ansis'
import restoreCursor from 'restore-cursor'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import pkgJson from '../package.json'
import { check } from './commands/check'
import { checkGlobal } from './commands/check/checkGlobal'
import { resolveConfig } from './config'
import { LOG_LEVELS, MODE_CHOICES } from './constants'
import { SORT_CHOICES } from './utils/sort'

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
    .option('ignore-other-workspaces', {
      type: 'boolean',
      default: true,
      describe: 'ignore package.json that in other workspaces (with their own .git,pnpm-workspace.yaml,etc.)',
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
}

// eslint-disable-next-line ts/no-unused-expressions
yargs(hideBin(process.argv))
  .scriptName('taze')
  .usage('$0 [args]')
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
        .option('group', {
          type: 'boolean',
          describe: 'group dependencies by source on display',
        })
        .option('includeLocked', {
          alias: 'l',
          type: 'boolean',
          describe: 'include locked dependencies & devDependencies',
        })
        .option('timediff', {
          type: 'boolean',
          describe: 'show time difference between the current and the updated version',
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
  .version('version', pkgJson.version)
  .alias('v', 'version')
  .help()
  .argv

restoreCursor()
