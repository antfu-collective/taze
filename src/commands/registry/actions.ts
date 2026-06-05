/* eslint-disable no-console */
import type { RegistryEntry } from './constants'
import process from 'node:process'
import prompts from '@posva/prompts'
import c from 'ansis'
import { fetch } from 'ofetch'
import { exec } from 'tinyexec'
import { HOME, REGISTRIES, REGISTRY } from './constants'
import {
  getRegistries,
  readNrmrc,
  writeNrmrc,
} from './io'

function isLowerCaseEqual(str1: string | undefined, str2: string | undefined): boolean {
  if (str1 && str2)
    return str1.toLowerCase() === str2.toLowerCase()
  return !str1 && !str2
}

function padding(message = '', before = 1, after = 1): string {
  return `${' '.repeat(before)}${message}${' '.repeat(after)}`
}

function printSuccess(message: string): void {
  console.log(`${c.bgGreenBright(padding('SUCCESS'))} ${message}`)
}

function printError(error: string): void {
  console.error(`${c.bgRed(padding('ERROR'))} ${c.red(error)}`)
}

function printMessages(messages: string[]): void {
  console.log(messages.join('\n'))
}

function geneDashLine(message: string, length: number): string {
  const finalMessage = '-'.repeat(Math.max(2, length - message.length + 2))
  return padding(c.dim(finalMessage))
}

function exit(error?: string): never {
  if (error)
    printError(error)
  process.exit(1)
}

function isRegistryNotFound(name: string, printErr = true): boolean {
  const registries = getRegistries()
  if (!Object.keys(registries).includes(name)) {
    if (printErr)
      printError(`The registry '${name}' is not found.`)
    return true
  }
  return false
}

function isInternalRegistry(name: string, handle?: string): boolean {
  if (Object.keys(REGISTRIES).includes(name)) {
    if (handle)
      printError(`You cannot ${handle} the nrm internal registry.`)
    return true
  }
  return false
}

async function getCurrentRegistry(): Promise<string | undefined> {
  try {
    const { stdout } = await exec('npm', ['config', 'get', 'registry'], { throwOnError: true })
    const value = stdout.trim()
    if (!value || value === 'undefined')
      return undefined
    return value
  }
  catch {
    exit('npm command not found. Please install npm to read registry configuration.')
  }
}

async function setNpmRegistry(url: string): Promise<void> {
  try {
    await exec('npm', ['config', 'set', 'registry', url], { throwOnError: true })
  }
  catch {
    exit('npm command not found. Please install npm to switch registries.')
  }
}

export async function listRegistries(): Promise<void> {
  const currentRegistry = await getCurrentRegistry()
  const registries = getRegistries()
  const keys = Object.keys(registries)
  const length = Math.max(...keys.map(key => key.length)) + 3

  const messages = keys.map((key) => {
    const registry = registries[key]
    const prefix = isLowerCaseEqual(registry[REGISTRY], currentRegistry)
      ? c.green.bold('* ')
      : '  '
    return prefix + key + geneDashLine(key, length) + registry[REGISTRY]
  })

  printMessages(messages)
}

export async function currentRegistry(options: { showUrl?: boolean } = {}): Promise<void> {
  const current = await getCurrentRegistry()
  const registries = getRegistries()

  const matchedRegistry = Object.entries(registries).find(([_name, registry]) =>
    isLowerCaseEqual(registry[REGISTRY], current),
  )

  if (!matchedRegistry) {
    printMessages([
      `Your current registry(${current}) is not included in the nrm registries.`,
      `Use the ${c.green('taze registry add <name> <url> [home]')} command to add your registry.`,
    ])
    return
  }

  const [name, registry] = matchedRegistry
  printMessages([
    `You are using ${c.green(options.showUrl ? registry[REGISTRY] : name)} registry.`,
  ])
}

export async function useRegistry(name?: string): Promise<void> {
  const registries = getRegistries()
  let alias = name

  if (alias === undefined) {
    const response = await prompts({
      type: 'select',
      name: 'alias',
      message: 'Please select the registry you want to use',
      choices: Object.keys(registries).map(key => ({ title: key, value: key })),
    })

    if (!response.alias)
      exit()

    alias = response.alias as string
  }

  if (isRegistryNotFound(alias))
    exit()

  const registry = registries[alias]
  await setNpmRegistry(registry[REGISTRY])
  printSuccess(`The registry has been changed to '${alias}'.`)
}

export async function deleteRegistry(name?: string): Promise<void> {
  const customRegistries = readNrmrc()
  const deleteKeys: string[] = []

  if (name)
    deleteKeys.push(name)

  const choices = Object.keys(customRegistries)
  if (name === undefined && !choices.length) {
    printMessages(['No any custom registries can be deleted.'])
    return
  }

  if (name === undefined) {
    const response = await prompts({
      type: 'multiselect',
      name: 'keys',
      message: 'Please select the registries you want to delete',
      choices: choices.map(key => ({ title: key, value: key })),
    })

    if (!response.keys?.length)
      return

    deleteKeys.push(...response.keys as string[])
  }

  for (const key of deleteKeys) {
    if (isRegistryNotFound(key) || isInternalRegistry(key, 'delete'))
      continue

    const registry = customRegistries[key]
    delete customRegistries[key]
    writeNrmrc(customRegistries)
    printSuccess(`The registry '${key}' has been deleted successfully.`)

    const current = await getCurrentRegistry()
    if (current === registry[REGISTRY])
      await setNpmRegistry(REGISTRIES.npm[REGISTRY])
  }
}

export function addRegistry(name: string, url: string, home?: string): void {
  const registries = getRegistries()
  const registryNames = Object.keys(registries)
  const registryUrls = registryNames.map(registryName => registries[registryName][REGISTRY])

  if (
    registryNames.includes(name)
    || registryUrls.some(eachUrl => isLowerCaseEqual(eachUrl, url))
  ) {
    exit('The registry name or url is already included in the nrm registries. Please make sure that the name and url are unique.')
  }

  const newRegistry: RegistryEntry = {
    registry: /\/$/.test(url) ? url : `${url}/`,
  }
  if (home)
    newRegistry[HOME] = home

  const customRegistries = readNrmrc()
  writeNrmrc(Object.assign(customRegistries, { [name]: newRegistry }))
  printSuccess(`Add registry ${name} success, run ${c.green(`taze registry use ${name}`)} command to use ${name} registry.`)
}

export interface RegistryTestResult {
  name: string
  registry: string
  success: boolean
  time: number
  isTimeout: boolean
}

export async function testRegistries(target?: string, timeout = 5000): Promise<RegistryTestResult[]> {
  const registries = getRegistries()

  if (target && isRegistryNotFound(target))
    exit()

  const sources = target ? { [target]: registries[target] } : registries

  const results = await Promise.all(
    Object.keys(sources).map(async (name) => {
      const { registry } = sources[name]
      const start = Date.now()
      let status = false
      let isTimeout = false
      try {
        const response = await fetch(`${registry}nrm`, {
          signal: AbortSignal.timeout(timeout),
        })
        status = response.ok
      }
      catch (error: unknown) {
        isTimeout = error instanceof Error && error.name === 'TimeoutError'
      }
      return {
        name,
        registry,
        success: status,
        time: Date.now() - start,
        isTimeout,
      }
    }),
  )

  const [fastest] = results
    .filter(each => each.success)
    .map(each => each.time)
    .sort((a, b) => a - b)

  const messages: string[] = []
  const current = await getCurrentRegistry()
  const errorMsg = c.red(' (Fetch error, if this is your private registry, please ignore)')
  const timeoutMsg = c.yellow(` (Fetch timeout over ${timeout} ms)`)
  const length = Math.max(...Object.keys(sources).map(key => key.length)) + 3

  for (const { registry, success, time, name, isTimeout } of results) {
    const isFastest = time === fastest
    const prefix = registry === current ? c.green('* ') : '  '
    let suffix = isFastest && !target
      ? c.bgGreenBright(`${time} ms`)
      : isTimeout
        ? 'timeout'
        : `${time} ms`
    if (!success)
      suffix += isTimeout ? timeoutMsg : errorMsg
    messages.push(prefix + name + geneDashLine(name, length) + suffix)
  }

  printMessages(messages)
  return results
}
