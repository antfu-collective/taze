#!/usr/bin/env node

import path from 'path'
import yargs from 'yargs'
import { check } from './check'

// eslint-disable-next-line no-unused-expressions
yargs
  .scriptName('taze')
  .usage('$0 <cmd> [args]')
  .command(
    'check',
    'check npm verison update',
    {
      path: {
        alias: 'p',
        default: path.resolve('.'),
        coerce: (p: string) => path.resolve(p),
      },
      recursive: {
        alias: 'r',
        default: false,
        boolean: true,
      },
      range: {
        default: 'major',
        string: true,
      },
    },
    async(args) => {
      return await check(args)
    },
  )
  .help()
  .argv
