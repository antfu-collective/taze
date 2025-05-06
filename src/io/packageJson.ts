import type { CommonOptions, DepType, PackageMeta, RawDep } from '../types'
import { resolve } from 'pathe'
import { builtinAddons } from '../addons'
import { dumpDependencies, getByPath, parseDependencies, parseDependency, setByPath } from './dependencies'
import { readJSON, writeJSON } from './packages'

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

export async function loadPackageJSON(
  relative: string,
  options: CommonOptions,
  shouldUpdate: (name: string) => boolean,
): Promise<PackageMeta[]> {
  const filepath = resolve(options.cwd ?? '', relative)
  const raw = await readJSON(filepath)
  const deps: RawDep[] = []

  for (const key of allDepsFields) {
    if (!isDepFieldEnabled(key, options))
      continue

    if (key === 'packageManager') {
      if (raw.packageManager) {
        const [name, version] = raw.packageManager.split('@')
        // `+` sign can be used to pin the hash of the package manager, we remove it to be semver compatible.
        deps.push(parseDependency(name, `^${version.split('+')[0]}`, 'packageManager', shouldUpdate))
      }
    }
    else {
      deps.push(...parseDependencies(raw, key, shouldUpdate))
    }
  }

  return [
    {
      name: raw.name,
      private: !!raw.private,
      version: raw.version,
      type: 'package.json',
      relative,
      filepath,
      raw,
      deps,
      resolved: [],
    },
  ]
}

export async function writePackageJSON(
  pkg: PackageMeta,
  options: CommonOptions,
) {
  let changed = false

  for (const key of allDepsFields) {
    if (!isDepFieldEnabled(key, options))
      continue

    if (key === 'packageManager') {
      const value = Object.entries(dumpDependencies(pkg.resolved, 'packageManager'))[0]
      if (value) {
        pkg.raw.packageManager = `${value[0]}@${value[1].replace('^', '')}`
        changed = true
      }
    }
    else {
      if (getByPath(pkg.raw, key)) {
        setByPath(pkg.raw, key, dumpDependencies(pkg.resolved, key))
        changed = true
      }
    }
  }

  if (changed) {
    for (const addon of (options.addons || builtinAddons)) {
      await addon.beforeWrite?.(pkg, options)
    }
    await writeJSON(pkg.filepath, pkg.raw)
  }
}
