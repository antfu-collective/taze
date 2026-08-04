import type { CommonOptions, DepType, PackageMeta, RawDep } from '../types'
import { resolve } from 'pathe'
import { builtinAddons } from '../addons'
import { getHexHashFromIntegrity } from '../utils/sha'
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

type PackageManagerDeclaration
  = | { field: 'packageManager', name: string, version: string, hexHash?: string }
    | { field: 'devEngines', name: string, version: string }

function getPackageManagerDeclaration(raw: Record<string, any>): PackageManagerDeclaration | undefined {
  if (typeof raw.packageManager === 'string') {
    const [name, versionWithHash] = raw.packageManager.split('@')
    if (name && versionWithHash) {
      // `+` sign can be used to pin the hash of the package manager, we remove it to be semver compatible.
      const [version, hashPart] = versionWithHash.split('+')
      if (version) {
        return {
          field: 'packageManager',
          name,
          version: `^${version}`,
          hexHash: hashPart?.split('.')[1],
        }
      }
    }
  }

  const packageManager = raw.devEngines?.packageManager
  if (typeof packageManager?.name === 'string' && packageManager.name && typeof packageManager.version === 'string' && packageManager.version) {
    return {
      field: 'devEngines',
      name: packageManager.name,
      version: packageManager.version,
    }
  }
}

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
  existingRaw?: Record<string, unknown>,
): Promise<PackageMeta[]> {
  const filepath = resolve(options.cwd ?? '', relative)
  const raw: Record<string, any> = existingRaw ?? await readJSON(filepath)
  const deps: RawDep[] = []

  for (const key of allDepsFields) {
    if (!isDepFieldEnabled(key, options))
      continue

    if (key === 'packageManager') {
      const packageManager = getPackageManagerDeclaration(raw)
      if (packageManager) {
        const { name, version } = packageManager
        const hexHash = packageManager.field === 'packageManager' ? packageManager.hexHash : undefined
        deps.push(parseDependency({ name, version, type: 'packageManager', shouldUpdate, hexHash }))
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
      const declaration = getPackageManagerDeclaration(pkg.raw || {})
      if (value && declaration) {
        pkg.raw ||= {}
        const [name, versionWithCaret] = value
        if (declaration.field === 'packageManager') {
          const version = versionWithCaret.replace('^', '')
          let packageManagerValue = `${name}@${version}`

          const resolvedDep = pkg.resolved.find(dep => dep.source === 'packageManager' && dep.name === name)
          if (resolvedDep?.hexHash) {
            // `pkgData` may be undefined when the dep was filtered out (e.g. via
            // `--include`) and the resolve path that fetches registry data was
            // skipped. In that case there's no fresh integrity to refresh with.
            const integrity = resolvedDep.pkgData?.integrity?.[version]
            if (integrity) {
              const newHexHash = getHexHashFromIntegrity(integrity)
              packageManagerValue = `${packageManagerValue}+sha512.${newHexHash}`
            }
          }

          pkg.raw.packageManager = packageManagerValue
        }
        else {
          pkg.raw.devEngines.packageManager.version = versionWithCaret
        }
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
    await writeJSON(pkg.filepath, pkg.raw || {})
  }
}
