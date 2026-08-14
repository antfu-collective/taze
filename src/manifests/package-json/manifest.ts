import type { CommonOptions, PackageMeta } from '../../types'
import type { Manifest } from '../types'
import { existsSync } from 'node:fs'
import process from 'node:process'
import { join, resolve } from 'pathe'
import { builtinAddons } from '../../addons'
import { getHexHashFromIntegrity } from '../../utils/sha'
import { bunWorkspaceManifest } from '../bun-workspace'
import { dumpDependencies, getByPath, parseDependency, setByPath } from '../dependencies'
import { dumpDependencyFields, parseDependencyFields } from '../fields'
import { readJSON, writeJSON } from '../json'

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

/**
 * Locate the `devEngines.runtime` entry that pins Node.js (`runtime` may be a
 * single object or an array). Returns the live object so writes can mutate its
 * `version` in place; `undefined` when there's no usable node runtime.
 */
function getNodeRuntime(raw: Record<string, any>): { name: string, version: string } | undefined {
  const runtime = raw?.devEngines?.runtime
  const entries = Array.isArray(runtime) ? runtime : runtime ? [runtime] : []
  return entries.find(e => e?.name === 'node' && typeof e.version === 'string' && e.version)
}

export async function loadPackageJSON(
  relative: string,
  options: CommonOptions,
  shouldUpdate: (name: string) => boolean,
  existingRaw?: Record<string, unknown>,
): Promise<PackageMeta[]> {
  const filepath = resolve(options.cwd ?? '', relative)
  const raw: Record<string, any> = existingRaw ?? await readJSON(filepath)

  const deps = parseDependencyFields(raw, options, shouldUpdate, () => {
    const packageManager = getPackageManagerDeclaration(raw)
    if (!packageManager)
      return undefined
    const { name, version } = packageManager
    const hexHash = packageManager.field === 'packageManager' ? packageManager.hexHash : undefined
    return parseDependency({ name, version, type: 'packageManager', shouldUpdate, hexHash })
  })

  // `devEngines.runtime` Node.js pin, resolved by the `node` registry. Shares
  // the `.node-version` opt-out since it's the same kind of update.
  const runtime = options.nodeVersion !== false ? getNodeRuntime(raw) : undefined
  if (runtime) {
    deps.push(parseDependency({
      name: 'node',
      version: runtime.version,
      type: 'devEngines.runtime',
      packageType: 'node',
      shouldUpdate,
    }))
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
  let changed = dumpDependencyFields(pkg.resolved, options, {
    has: key => !!getByPath(pkg.raw, key),
    set: (key, values) => setByPath(pkg.raw, key, values),
    setPackageManager: () => {
      const value = Object.entries(dumpDependencies(pkg.resolved, 'packageManager'))[0]
      const declaration = getPackageManagerDeclaration(pkg.raw || {})
      if (!value || !declaration)
        return false

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
      return true
    },
  })

  // Write the resolved `devEngines.runtime` Node.js version back in place.
  const runtimeDep = pkg.resolved.find(dep => dep.source === 'devEngines.runtime' && dep.update)
  if (runtimeDep) {
    const runtime = getNodeRuntime(pkg.raw || {})
    if (runtime) {
      runtime.version = runtimeDep.targetVersion
      changed = true
    }
  }

  if (changed) {
    for (const addon of (options.addons || builtinAddons)) {
      await addon.beforeWrite?.(pkg, options)
    }
    await writeJSON(pkg.filepath, pkg.raw || {})
  }
}

/**
 * Load a package.json, additionally emitting Bun catalog packages when the file
 * declares Bun workspace catalogs and a `bun.lock(b)` is present. The catalogs
 * and the package.json share the same `raw` object so writes don't clobber each
 * other.
 */
async function loadPackageJSONManifest(
  relative: string,
  options: CommonOptions,
  shouldUpdate: (name: string) => boolean,
): Promise<PackageMeta[]> {
  const filepath = resolve(options.cwd ?? '', relative)
  try {
    const raw = await readJSON(filepath)
    const workspaces = raw?.workspaces

    // Only process Bun catalogs if we detect Bun is being used
    if (workspaces && (workspaces.catalog || workspaces.catalogs)) {
      const cwd = resolve(options.cwd || process.cwd())
      const hasBunLock = existsSync(join(cwd, 'bun.lockb')) || existsSync(join(cwd, 'bun.lock'))

      if (hasBunLock) {
        // Pass the same raw object to both loaders so writes don't clobber each other
        const bunWorkspaces = await bunWorkspaceManifest.load(relative, options, shouldUpdate, raw)
        const packageJson = await loadPackageJSON(relative, options, shouldUpdate, raw)
        return [...bunWorkspaces, ...packageJson]
      }
    }

    // Reuse already-read raw for non-bun case
    return loadPackageJSON(relative, options, shouldUpdate, raw)
  }
  catch {
    // Safe guard: If we can't read the file, fall back to normal package.json loading
  }

  return loadPackageJSON(relative, options, shouldUpdate)
}

export const packageJsonManifest: Manifest = {
  name: 'package.json',
  type: 'package.json',
  match: filepath => filepath.endsWith('package.json'),
  load: loadPackageJSONManifest,
  write: writePackageJSON,
}
