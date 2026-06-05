import type { RegistryEntry } from './constants'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { parse, stringify } from 'yaml'
import { REGISTRIES, REGISTRIES_CONFIG } from './constants'

let registriesPathOverride: string | undefined

export function setRegistryPaths(paths: { registries?: string }) {
  registriesPathOverride = paths.registries
}

export function resetRegistryPaths() {
  registriesPathOverride = undefined
}

function resolveRegistriesPath(): string {
  return registriesPathOverride ?? process.env.TAZE_REGISTRIES_PATH ?? REGISTRIES_CONFIG
}

function legacyNrmrcPath(): string {
  return path.join(os.homedir(), '.nrmrc')
}

/** Minimal parser for legacy nrm ~/.nrmrc (ini sections only). */
export function parseLegacyNrmrc(content: string): Record<string, RegistryEntry> {
  const result: Record<string, RegistryEntry> = {}
  let section: string | undefined

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#') || line.startsWith(';'))
      continue

    const sectionMatch = line.match(/^\[([^\]]+)\]$/)
    if (sectionMatch) {
      section = sectionMatch[1]
      if (!result[section])
        result[section] = { registry: '' }
      continue
    }

    const kvMatch = line.match(/^([^=]+)=(.*)$/)
    if (!kvMatch || !section)
      continue

    const key = kvMatch[1].trim()
    const value = kvMatch[2].trim()
    const entry = result[section] ??= { registry: '' }
    entry[key] = value
  }

  for (const [name, entry] of Object.entries(result)) {
    if (!entry.registry)
      delete result[name]
  }

  return result
}

function migrateLegacyNrmrc(targetPath: string): Record<string, RegistryEntry> | undefined {
  const legacyPath = legacyNrmrcPath()
  if (!fs.existsSync(legacyPath))
    return undefined

  try {
    const migrated = parseLegacyNrmrc(fs.readFileSync(legacyPath, 'utf-8'))
    if (Object.keys(migrated).length > 0)
      writeRegistriesConfig(migrated, targetPath)
    return migrated
  }
  catch {
    return undefined
  }
}

function shouldMigrateLegacy(): boolean {
  return !registriesPathOverride && !process.env.TAZE_REGISTRIES_PATH
}

export function readRegistriesConfig(filePath = resolveRegistriesPath()): Record<string, RegistryEntry> {
  if (!fs.existsSync(filePath)) {
    if (shouldMigrateLegacy()) {
      const migrated = migrateLegacyNrmrc(filePath)
      if (migrated)
        return migrated
    }
    return {}
  }

  try {
    const parsed = parse(fs.readFileSync(filePath, 'utf-8'))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      return {}
    return parsed as Record<string, RegistryEntry>
  }
  catch (error) {
    throw new Error(`Failed to read ${filePath}: ${error}`)
  }
}

export function writeRegistriesConfig(
  content: Record<string, RegistryEntry>,
  filePath = resolveRegistriesPath(),
): void {
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir))
    fs.mkdirSync(dir, { recursive: true })

  fs.writeFileSync(filePath, `${stringify(content, { lineWidth: 0 })}\n`, 'utf-8')
}

/** @deprecated Use readRegistriesConfig */
export function readNrmrc(): Record<string, RegistryEntry> {
  return readRegistriesConfig()
}

/** @deprecated Use writeRegistriesConfig */
export function writeNrmrc(content: Record<string, RegistryEntry>): void {
  writeRegistriesConfig(content)
}

export function getRegistries(): Record<string, RegistryEntry> {
  const customRegistries = readRegistriesConfig()
  return Object.assign({}, REGISTRIES, customRegistries)
}
