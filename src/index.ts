#!/usr/bin/env node

import yargs from 'yargs'
import { check } from './check'

// eslint-disable-next-line no-unused-expressions
yargs
  .scriptName('taze')
  .usage('$0 <cmd> [args]')
  .command(
    'check',
    'check npm verison update',
    () => {},
    check,
  )
  .help()
  .argv
