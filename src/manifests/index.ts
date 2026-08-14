import type { CommonOptions, PackageMeta } from '../types'
import type { Manifest } from './types'
import process from 'node:process'
import { up as findUp } from 'empathic/find'
import { dirname, join, resolve } from 'pathe'
import { glob } from 'tinyglobby'
import { DEFAULT_IGNORE_PATHS } from '../constants'
import { createDependenciesFilter } from '../utils/dependenciesFilter'
import { bunWorkspaceManifest } from './bunWorkspace'
import { githubActionsManifest } from './githubActions'
import { packageJsonManifest } from './packageJson'
import { packageYamlManifest } from './packageYaml'
import { pnpmWorkspaceManifest } from './pnpmWorkspace'
import { yarnWorkspaceManifest } from './yarnWorkspace'

export { dumpDependencies, parseDependencies } from './dependencies'
export { readJSON, writeJSON } from './json'
export type { Manifest } from './types'

/**
 * All available manifests — the file-source axis. Register a new file source by
 * adding it here; discovery and write routing pick it up automatically.
 */
export const manifests: Manifest[] = [
  yarnWorkspaceManifest,
  pnpmWorkspaceManifest,
  packageJsonManifest,
  packageYamlManifest,
  bunWorkspaceManifest,
  githubActionsManifest,
]

function isManifestEnabled(manifest: Manifest, options: CommonOptions): boolean {
  return manifest.enabled?.(options) ?? true
}

export async function writePackage(
  pkg: PackageMeta,
  options: CommonOptions,
) {
  const manifest = manifests.find(m =>
    Array.isArray(m.type) ? m.type.includes(pkg.type as any) : m.type === pkg.type,
  )
  if (!manifest)
    throw new Error(`Unsupported package type: ${pkg.type}`)
  return manifest.write(pkg, options)
}

export async function loadPackage(
  relative: string,
  options: CommonOptions,
  shouldUpdate: (name: string) => boolean,
): Promise<PackageMeta[]> {
  const manifest = manifests.find(m => isManifestEnabled(m, options) && m.match(relative))
    ?? packageJsonManifest
  return manifest.load(relative, options, shouldUpdate)
}

/**
 * Discover `package.json` / `package.yaml` files. package.yaml takes priority
 * over package.json in the same directory, and `ignoreOtherWorkspaces` prunes
 * nested packages that belong to a different workspace root.
 */
async function discoverPackageFiles(options: CommonOptions): Promise<string[]> {
  const cwd = resolve(options.cwd || process.cwd())
  let packagesNames: string[] = []

  if (options.recursive) {
    // Look for both package.yaml and package.json files
    const yamlPackages = await glob('**/package.yaml', {
      ignore: DEFAULT_IGNORE_PATHS.concat(options.ignorePaths || []),
      cwd: options.cwd,
      onlyFiles: true,
      dot: false,
      expandDirectories: false,
    })

    const jsonPackages = await glob('**/package.json', {
      ignore: DEFAULT_IGNORE_PATHS.concat(options.ignorePaths || []),
      cwd: options.cwd,
      onlyFiles: true,
      dot: false,
      expandDirectories: false,
    })

    // Prioritize package.yaml over package.json in the same directory
    const packageDirs = new Set<string>()

    // Add all package.yaml files first (higher priority)
    for (const yamlPkg of yamlPackages) {
      packagesNames.push(yamlPkg)
      const dir = dirname(yamlPkg)
      packageDirs.add(dir)
    }

    // Add package.json files only if no package.yaml exists in the same directory
    for (const jsonPkg of jsonPackages) {
      const dir = dirname(jsonPkg)
      if (!packageDirs.has(dir)) {
        packagesNames.push(jsonPkg)
      }
    }
  }
  else {
    packagesNames = await glob('package.{yaml,json}', { cwd })
  }

  packagesNames = packagesNames.sort((a, b) => a.localeCompare(b))

  if (options.ignoreOtherWorkspaces) {
    packagesNames = (await Promise.all(
      packagesNames.map(async (packagePath) => {
        if (!packagePath.includes('/'))
          return [packagePath]

        const absolute = join(cwd, packagePath)
        const gitDir = findUp('.git', { cwd: absolute, last: cwd })
        if (gitDir && dirname(gitDir) !== cwd)
          return []
        const pnpmWorkspace = findUp('pnpm-workspace.yaml', { cwd: absolute, last: cwd })
        if (pnpmWorkspace && dirname(pnpmWorkspace) !== cwd)
          return []
        const yarnWorkspace = findUp('.yarnrc.yml', { cwd: absolute, last: cwd })
        if (yarnWorkspace && dirname(yarnWorkspace) !== cwd)
          return []
        const bunLock = findUp('bun.lockb', { cwd: absolute, last: cwd })
          || findUp('bun.lock', { cwd: absolute, last: cwd })
        if (bunLock && dirname(bunLock) !== cwd)
          return []
        return [packagePath]
      }),
    )).flat()
  }

  return packagesNames
}

export async function loadPackages(options: CommonOptions): Promise<PackageMeta[]> {
  const filter = createDependenciesFilter(options.include, options.exclude)

  // Collect discovery results from every source, tagged with a load order.
  // package.json / package.yaml share the core discovery (order 0); catalog
  // files load before them (negative order) and GitHub Actions after (order 1).
  const groups: { order: number, paths: string[] }[] = [
    { order: 0, paths: await discoverPackageFiles(options) },
  ]

  for (const manifest of manifests) {
    if (!manifest.discover || !isManifestEnabled(manifest, options))
      continue
    groups.push({ order: manifest.order ?? 0, paths: await manifest.discover(options) })
  }

  groups.sort((a, b) => a.order - b.order)
  const packagesNames = groups.flatMap(g => g.paths)

  const packages = (await Promise.all(
    packagesNames.map(
      relative => loadPackage(relative, options, filter),
    ),
  )).flat()

  return packages
}
