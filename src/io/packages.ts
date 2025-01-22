import type { CommonOptions, PackageMeta } from '../types'
import { existsSync, promises as fs } from 'node:fs'
import path from 'node:path'
import detectIndent from 'detect-indent'
import fg from 'fast-glob'
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

  const filter = createDependenciesFilter(options.include, options.exclude)

  if (options.recursive) {
    packagesNames = await fg('**/package.json', {
      ignore: DEFAULT_IGNORE_PATHS.concat(options.ignorePaths || []),
      cwd: options.cwd,
      onlyFiles: true,
      dot: false,
    })
    packagesNames.sort((a, b) => a.localeCompare(b))
  }
  else {
    packagesNames = ['package.json']
  }

  if (existsSync(path.join(options.cwd || '', 'pnpm-workspace.yaml'))) {
    packagesNames.unshift('pnpm-workspace.yaml')
  }

  const packages = (await Promise.all(
    packagesNames.map(
      relative => loadPackage(relative, options, filter),
    ),
  )).flat()

  return packages
}
