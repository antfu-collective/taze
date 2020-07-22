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
    {
      cwd: {
        alias: 'C',
        default: path.resolve('.'),
        coerce: (p: string) => path.resolve(p),
      },
      recursive: {
        alias: 'r',
        default: false,
        boolean: true,
      },
      mode: {
        alias: 'm',
        default: 'range',
        string: true,
      },
      write: {
        alias: 'w',
        default: false,
        boolean: true,
      },
    },
    check as any,
  )
  .help()
  .argv
