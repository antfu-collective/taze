import yargs, { Argv } from 'yargs'
import { check } from './commands/check'
import { usage } from './commands/usage'
import { CommonOptions } from './types'

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
      default: false,
      type: 'boolean',
      describe: 'recursively search for package.json in subdirectories',
    })
    // TODO:
    .option('filter', {
      type: 'string',
      array: true,
      describe: 'filter rules to restrict dependencies to check updates',
    })
    // TODO:
    .option('ignore', {
      type: 'string',
      array: true,
      describe: 'ignore rules to restrict dependencies to not check updates',
    })
    .option('dev', {
      alias: 'D',
      default: false,
      type: 'boolean',
      describe: 'update only for devDependencies',
    })
    .option('prod', {
      alias: 'P',
      default: false,
      type: 'boolean',
      describe: 'update only for dependencies',
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
    },
    args => usage(args),
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
    },
    args => check(args),
  )
  .help()
  .argv
