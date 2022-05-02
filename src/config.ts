import { promises as fs } from 'fs'
import { findUp } from 'find-up'
import deepmerge from 'deepmerge'
import _debug from 'debug'
import type { CommonOptions } from './types'
import { toArray } from './utils/toArray'

const debug = _debug('taze:config')

export const CONFIG_FILES = ['.tazerc.json', '.tazerc']
export const LOGLEVELS = ['debug', 'info', 'warn', 'error', 'silent']

function normalizeConfig<T extends CommonOptions >(options: T) {
  options.exclude = toArray(options.exclude)
  options.include = toArray(options.include)

  if (options.silent)
    options.loglevel = 'silent'

  return options
}

export async function resolveConfig<T extends CommonOptions>(options: T): Promise<T> {
  options = normalizeConfig(options)
  const match = await findUp(CONFIG_FILES, { cwd: options.cwd || process.cwd() })

  if (!match)
    return options

  debug(`config file found ${match}`)
  const configOptions = normalizeConfig(JSON.parse(await fs.readFile(match, 'utf-8')))

  return deepmerge(configOptions, options) as T
}
