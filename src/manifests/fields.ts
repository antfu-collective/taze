import type { CommonOptions, DepType, RawDep, ResolvedDepChange } from '../types'
import { dumpDependencies, parseDependencies } from './dependencies'

/**
 * The package.json-style dependency fields, in the order they are read and
 * written. Shared by the package.json and package.yaml manifests.
 */
const allDepsFields = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
  'packageManager',
  'pnpm.overrides',
  'resolutions',
  'overrides',
] as const satisfies DepType[]

function isDepFieldEnabled(key: DepType, options: CommonOptions): boolean {
  if (options.depFields?.[key] === false)
    return false
  if (key === 'peerDependencies')
    return !!options.peer
  return true
}

/**
 * Parse every enabled dependency field from a plain object. `packageManager` is
 * delegated to `parsePackageManager` because its shape differs per manifest
 * (package.json also understands `devEngines` and integrity hashes).
 */
export function parseDependencyFields(
  raw: Record<string, any>,
  options: CommonOptions,
  shouldUpdate: (name: string) => boolean,
  parsePackageManager: () => RawDep | undefined,
): RawDep[] {
  const deps: RawDep[] = []
  for (const key of allDepsFields) {
    if (!isDepFieldEnabled(key, options))
      continue

    if (key === 'packageManager') {
      const dep = parsePackageManager()
      if (dep)
        deps.push(dep)
    }
    else {
      deps.push(...parseDependencies(raw, key, shouldUpdate))
    }
  }
  return deps
}

/**
 * Dump every enabled dependency field back to a manifest via callbacks and
 * report whether anything changed. `packageManager` writing is delegated to
 * `setPackageManager`; other fields go through `has` / `set`.
 */
export function dumpDependencyFields(
  resolved: ResolvedDepChange[],
  options: CommonOptions,
  handlers: {
    has: (key: DepType) => boolean
    set: (key: DepType, values: Record<string, any>) => void
    setPackageManager: () => boolean
  },
): boolean {
  let changed = false
  for (const key of allDepsFields) {
    if (!isDepFieldEnabled(key, options))
      continue

    if (key === 'packageManager') {
      if (handlers.setPackageManager())
        changed = true
    }
    else if (handlers.has(key)) {
      handlers.set(key, dumpDependencies(resolved, key))
      changed = true
    }
  }
  return changed
}
