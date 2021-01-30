import { promises as fs } from 'fs'
import findUp from 'find-up'
import deepmerge from 'deepmerge'
import _debug from 'debug'
import { CommonOptions } from './types'
import { toArray } from './utils/toArray'

const debug = _debug('taze:config')

export const CONFIG_FILES = ['.tazerc.json', '.tazerc']
export const LOGLEVELS = ['debug', 'info', 'warn', 'error']

export async function resolveConfig<T extends CommonOptions>(options: T): Promise<T> {
  const match = await findUp(CONFIG_FILES, { cwd: options.cwd || process.cwd() })
  if (!match)
    return options

  options.exclude = toArray(options.exclude)
  options.include = toArray(options.include)

  debug(`config file found ${match}`)

  const configOptions = JSON.parse(await fs.readFile(match, 'utf-8'))

  return deepmerge(configOptions, options) as T
}
