import yargs, { Argv } from 'yargs'
import chalk from 'chalk'
import { check } from './commands/check'
import { usage } from './commands/usage'
import { CommonOptions } from './types'
import { resolveConfig } from './config'

function commonOptions(args: Argv<{}>): Argv<CommonOptions> {
  return args
    .option('cwd', {
      alias: 'C',
      default: '',
      type: 'string',
      describe: 'specify the current working directory',
    })
    .option('recursive', {
      alias: 'r',
      type: 'boolean',
      describe: 'recursively search for package.json in subdirectories',
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
yargs
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
        .demandOption('recursive', chalk.yellow('Please add -r to analysis usages'))
    },
    async args => usage(await resolveConfig({ ...args, recursive: true })),
  )
  .command(
    '* [mode]',
    'Keeps your deps fresh',
    (args) => {
      return commonOptions(args)
        .positional('mode', {
          default: 'default',
          type: 'string',
          describe: 'the mode how version range resolves, can be "default", "major", "minor", "latest" or "newest"',
          choices: ['default', 'major', 'minor', 'patch', 'latest', 'newest'],
        })
        .option('write', {
          alias: 'w',
          default: false,
          type: 'boolean',
          describe: 'write to package.json',
        })
        // TODO：
        .option('prompt', {
          alias: 'p',
          default: false,
          type: 'boolean',
          describe: 'prompt whether write to files after update checking',
        })
        // TODO：
        .option('outputRange', {
          default: 'preseve',
          type: 'string',
          describe: 'output version range, can be "fixed", "major", "minor" or "patch"',
        })
        // TODO:
        .option('guard', {
          default: false,
          type: 'boolean',
          describe: 'exit with non-zero code if there are existing upgrades',
        })
        .option('all', {
          alias: 'a',
          default: false,
          type: 'boolean',
          describe: 'show all packages up to date info',
        })
        .help()
    },
    async args => check(await resolveConfig(args)),
  )
  .showHelpOnFail(false)
  .alias('h', 'help')
  .alias('v', 'version')
  .help()
  .argv
