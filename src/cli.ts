import path from 'path'
import yargs from 'yargs'
import { check } from './check'

// eslint-disable-next-line no-unused-expressions
yargs
  .scriptName('taze')
  .usage('$0 [args]')
  .command(
    '*',
    'check npm version update',
    (args) => {
      args
        .positional('cwd', {
          alias: 'C',
          default: '',
          type: 'string',
          coerce: (p: string) => path.resolve(p),
          describe: 'specify the current working directory',
        })
        .positional('recursive', {
          alias: 'r',
          default: false,
          type: 'boolean',
          describe: 'recursively search for package.json in subdirectories',
        })
        .positional('mode', {
          alias: 'm',
          default: 'default',
          type: 'string',
          describe: 'dependency range resolve more, can also be "major" and "minor"',
        })
        .positional('write', {
          alias: 'w',
          default: false,
          type: 'boolean',
          describe: 'write to package.json',
        })
    },
    check,
  )
  .help()
  .argv
