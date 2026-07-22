import { existsSync, readFileSync } from 'node:fs'
import process from 'node:process'
import { resolve } from 'pathe'
import { parsePnpmWorkspaceYaml } from 'pnpm-workspace-yaml'
import { parse as parseToml } from 'smol-toml'

/**
 * Custom registries live in package-manager-specific config files that the npm
 * config resolution used to fetch package metadata (`.npmrc` + `npm_config_*`)
 * doesn't read:
 *
 * - pnpm — `pnpm-workspace.yaml` (`registries`)
 * - Yarn Berry — `.yarnrc.yml` (`npmRegistryServer`, `npmScopes`, `npmRegistries`)
 * - Bun — `bunfig.toml` (`[install].registry`, `[install.scopes]`)
 *
 * We read whichever of these are present and translate their registry — and,
 * where the file carries it, bearer-token auth — into `npm_config_*` entries.
 * Feeding those through the env makes package metadata resolve against the
 * right registry, and — since env config outranks `.npmrc` — mirrors how these
 * tools let their own config override `.npmrc`.
 *
 * Only bearer-token auth is translated; username/password (basic) auth is left
 * to `.npmrc`. Results are cached per directory.
 */
const cache = new Map<string, Record<string, string>>()

export function getRegistriesEnv(cwd: string = process.cwd()): Record<string, string> {
  const dir = resolve(cwd)
  const cached = cache.get(dir)
  if (cached)
    return cached

  const env: Record<string, string> = {
    ...readPnpmRegistries(dir),
    ...readYarnRegistries(dir),
    ...readBunRegistries(dir),
  }

  cache.set(dir, env)
  return env
}

function readFileIfExists(filepath: string): string | undefined {
  return existsSync(filepath) ? readFileSync(filepath, 'utf-8') : undefined
}

function scopeRegistryKey(scope: string): string {
  return `npm_config_${scope.startsWith('@') ? scope : `@${scope}`}:registry`
}

/**
 * Build the URL-scoped `npm_config_//host/path/:_authToken` key that the npm
 * config resolution matches auth against. Accepts either a full registry URL
 * or a Yarn-style `//host` key.
 */
function authTokenKey(registry: string): string | undefined {
  try {
    const url = new URL(registry.startsWith('//') ? `https:${registry}` : registry)
    const path = url.pathname.endsWith('/') ? url.pathname : `${url.pathname}/`
    return `npm_config_//${url.host}${path}:_authToken`
  }
  catch {
    return undefined
  }
}

// Yarn expands `${NAME}`, `${NAME:-fallback}` (unset or empty) and
// `${NAME-fallback}` (unset only) in `.yarnrc.yml` values.
function expandYarnEnv(value: string): string {
  return value.replace(/\$\{([^}]+)\}/g, (_, expr: string) => {
    // The operator is the first `-` in the expression, optionally preceded by
    // `:`; everything before it is the variable name, everything after is the
    // fallback.
    const dash = expr.indexOf('-')
    if (dash === -1)
      return process.env[expr] ?? ''

    const colon = expr[dash - 1] === ':'
    const name = expr.slice(0, colon ? dash - 1 : dash)
    const fallback = expr.slice(dash + 1)
    const current = process.env[name]
    if (colon)
      return current == null || current === '' ? fallback : current
    return current == null ? fallback : current
  })
}

// Bun expands `$NAME` (and `${NAME}`) in `bunfig.toml` values.
function expandBunEnv(value: string): string {
  return value
    .replace(/\$\{(\w+)\}/g, (_, name: string) => process.env[name] ?? '')
    .replace(/\$(\w+)/g, (_, name: string) => process.env[name] ?? '')
}

function readPnpmRegistries(dir: string): Record<string, string> {
  const text = readFileIfExists(resolve(dir, 'pnpm-workspace.yaml'))
  if (text == null)
    return {}

  const env: Record<string, string> = {}
  const raw = parsePnpmWorkspaceYaml(text).getDocument().toJSON()
  const registries = raw?.registries as Record<string, unknown> | undefined
  for (const [scope, url] of Object.entries(registries ?? {})) {
    if (typeof url !== 'string')
      continue
    if (scope === 'default')
      env.npm_config_registry = url
    else if (scope.startsWith('@'))
      env[scopeRegistryKey(scope)] = url
  }
  return env
}

function readYarnRegistries(dir: string): Record<string, string> {
  const text = readFileIfExists(resolve(dir, '.yarnrc.yml'))
  if (text == null)
    return {}

  const env: Record<string, string> = {}
  const raw = parsePnpmWorkspaceYaml(text).getDocument().toJSON()

  // Default registry (+ optional top-level token).
  if (typeof raw?.npmRegistryServer === 'string') {
    const url = expandYarnEnv(raw.npmRegistryServer)
    env.npm_config_registry = url
    if (typeof raw?.npmAuthToken === 'string') {
      const key = authTokenKey(url)
      if (key != null)
        env[key] = expandYarnEnv(raw.npmAuthToken)
    }
  }

  // Per-scope registries, with auth co-located on the scope.
  const npmScopes = raw?.npmScopes as Record<string, any> | undefined
  for (const [scope, config] of Object.entries(npmScopes ?? {})) {
    if (typeof config?.npmRegistryServer !== 'string')
      continue
    const url = expandYarnEnv(config.npmRegistryServer)
    env[scopeRegistryKey(scope)] = url
    if (typeof config?.npmAuthToken === 'string') {
      const key = authTokenKey(url)
      if (key != null)
        env[key] = expandYarnEnv(config.npmAuthToken)
    }
  }

  // Per-registry auth, keyed by `//host`.
  const npmRegistries = raw?.npmRegistries as Record<string, any> | undefined
  for (const [registry, config] of Object.entries(npmRegistries ?? {})) {
    if (typeof config?.npmAuthToken !== 'string')
      continue
    const key = authTokenKey(registry)
    if (key != null)
      env[key] = expandYarnEnv(config.npmAuthToken)
  }

  return env
}

function readBunRegistries(dir: string): Record<string, string> {
  const text = readFileIfExists(resolve(dir, 'bunfig.toml'))
  if (text == null)
    return {}

  const env: Record<string, string> = {}
  const install = (parseToml(text) as Record<string, any>)?.install as Record<string, any> | undefined

  applyBunRegistry(env, 'default', install?.registry)

  const scopes = install?.scopes as Record<string, unknown> | undefined
  for (const [scope, config] of Object.entries(scopes ?? {}))
    applyBunRegistry(env, scope, config)

  return env
}

// A Bun registry entry is either a URL string or `{ url, token }`.
function applyBunRegistry(env: Record<string, string>, scope: string, config: unknown): void {
  let url: string | undefined
  let token: string | undefined
  if (typeof config === 'string') {
    url = config
  }
  else if (config != null && typeof config === 'object') {
    const record = config as Record<string, unknown>
    url = typeof record.url === 'string' ? record.url : undefined
    token = typeof record.token === 'string' ? record.token : undefined
  }
  if (url == null)
    return

  url = expandBunEnv(url)
  if (scope === 'default')
    env.npm_config_registry = url
  else
    env[scopeRegistryKey(scope)] = url

  if (token != null) {
    const key = authTokenKey(url)
    if (key != null)
      env[key] = expandBunEnv(token)
  }
}
