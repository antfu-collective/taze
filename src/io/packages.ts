import type { CommonOptions, PackageMeta } from '../types'
import { existsSync, promises as fs } from 'node:fs'
import process from 'node:process'
import detectIndent from 'detect-indent'
import { findUp } from 'find-up-simple'
import { dirname, join, resolve } from 'pathe'
import { glob } from 'tinyglobby'
import { DEFAULT_IGNORE_PATHS } from '../constants'
import { createDependenciesFilter } from '../utils/dependenciesFilter'
import { loadPackageJSON, writePackageJSON } from './packageJson'
import { loadPnpmWorkspace, writePnpmWorkspace } from './pnpmWorkspaces'

export async function readJSON(filepath: string) {
  return JSON.parse(await fs.readFile(filepath, 'utf-8'))
}

export async function writeJSON(filepath: string, data: any) {
  const actualContent = await fs.readFile(filepath, 'utf-8')
  const fileIndent = detectIndent(actualContent).indent || '  '

  return await fs.writeFile(filepath, `${JSON.stringify(data, null, fileIndent)}\n`, 'utf-8')
}

export async function writePackage(
  pkg: PackageMeta,
  options: CommonOptions,
) {
  switch (pkg.type) {
    case 'package.json':
      return writePackageJSON(pkg, options)
    case 'pnpm-workspace.yaml':
      return writePnpmWorkspace(pkg, options)
    default:
      throw new Error(`Unsupported package type: ${pkg.type}`)
  }
}

export async function loadPackage(
  relative: string,
  options: CommonOptions,
  shouldUpdate: (name: string) => boolean,
): Promise<PackageMeta[]> {
  if (relative.endsWith('pnpm-workspace.yaml'))
    return loadPnpmWorkspace(relative, options, shouldUpdate)
  return loadPackageJSON(relative, options, shouldUpdate)
}

export async function loadPackages(options: CommonOptions): Promise<PackageMeta[]> {
  let packagesNames: string[] = []

  const cwd = resolve(options.cwd || process.cwd())
  const filter = createDependenciesFilter(options.include, options.exclude)

  if (options.recursive) {
    packagesNames = await glob('**/package.json', {
      ignore: DEFAULT_IGNORE_PATHS.concat(options.ignorePaths || []),
      cwd: options.cwd,
      onlyFiles: true,
      dot: false,
      expandDirectories: false,
    })
    packagesNames.sort((a, b) => a.localeCompare(b))
  }
  else {
    packagesNames = ['package.json']
  }

  if (options.ignoreOtherWorkspaces) {
    packagesNames = (await Promise.all(
      packagesNames.map(async (packagePath) => {
        if (!packagePath.includes('/'))
          return [packagePath]

        const absolute = join(cwd, packagePath)
        const gitDir = await findUp('.git', { cwd: absolute, stopAt: cwd })
        if (gitDir && dirname(gitDir) !== cwd)
          return []
        const pnpmWorkspace = await findUp('pnpm-workspace.yaml', { cwd: absolute, stopAt: cwd })
        if (pnpmWorkspace && dirname(pnpmWorkspace) !== cwd)
          return []
        return [packagePath]
      }),
    )).flat()
  }

  if (existsSync(join(cwd, 'pnpm-workspace.yaml'))) {
    packagesNames.unshift('pnpm-workspace.yaml')
  }

  const packages = (await Promise.all(
    packagesNames.map(
      relative => loadPackage(relative, options, filter),
    ),
  )).flat()

  return packages
}
