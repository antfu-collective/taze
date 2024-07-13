import path from 'node:path'
import { existsSync, promises as fs } from 'node:fs'
import fg from 'fast-glob'
import YAML from 'js-yaml'
import detectIndent from 'detect-indent'
import type { CommonOptions, PackageMeta, RawDep } from '../types'
import { createDependenciesFilter } from '../utils/dependenciesFilter'
import { DEFAULT_IGNORE_PATHS } from '../constants'
import { dumpDependencies, getByPath, parseDependencies, parseDependency, setByPath } from './dependencies'

export async function readJSON(filepath: string) {
  return JSON.parse(await fs.readFile(filepath, 'utf-8'))
}

export async function writeJSON(filepath: string, data: any) {
  const actualContent = await fs.readFile(filepath, 'utf-8')
  const fileIndent = detectIndent(actualContent).indent || '  '

  return await fs.writeFile(filepath, `${JSON.stringify(data, null, fileIndent)}\n`, 'utf-8')
}

const depsFields = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'packageManager',
  'pnpm.overrides',
  'resolutions',
  'overrides',
] as const

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

export async function writePnpmWorkspace(
  pkg: PackageMeta,
  _options: CommonOptions,
) {
  const catalogName = pkg.name.replace('pnpm-catalog:', '')
  const versions = dumpDependencies(pkg.resolved, 'pnpm:catalog')

  if (!Object.keys(versions).length)
    return

  if (catalogName === 'default') {
    pkg.raw.catalog = versions
  }
  else {
    pkg.raw.catalogs ??= {}
    pkg.raw.catalogs[catalogName] = versions
  }

  await fs.writeFile(pkg.filepath, YAML.dump(pkg.raw), 'utf-8')
}

export async function writePackageJSON(
  pkg: PackageMeta,
  options: CommonOptions,
) {
  const { raw, filepath, resolved } = pkg

  let changed = false

  depsFields.forEach((key) => {
    if (options.depFields?.[key] === false)
      return
    if (key === 'packageManager') {
      const value = Object.entries(dumpDependencies(resolved, 'packageManager'))[0]
      if (value) {
        raw.packageManager = `${value[0]}@${value[1].replace('^', '')}`
        changed = true
      }
    }
    else {
      if (getByPath(raw, key)) {
        setByPath(raw, key, dumpDependencies(resolved, key))
        changed = true
      }
    }
  })

  if (changed)
    await writeJSON(filepath, raw)
}

export async function loadPnpmWorkspace(
  relative: string,
  options: CommonOptions,
  shouldUpdate: (name: string) => boolean,
): Promise<PackageMeta[]> {
  const filepath = path.resolve(options.cwd ?? '', relative)
  const rawText = await fs.readFile(filepath, 'utf-8')
  const raw = YAML.load(rawText) as any

  const catalogs: PackageMeta[] = []

  function createCatalogFromKeyValue(catalogName: string, map: Record<string, string>): PackageMeta {
    const deps: RawDep[] = Object.entries(map)
      .map(([name, version]) => parseDependency(name, version, 'pnpm:catalog', shouldUpdate))

    return {
      name: `pnpm-catalog:${catalogName}`,
      private: true,
      version: '',
      type: 'pnpm-workspace.yaml',
      relative,
      filepath,
      raw,
      deps,
      resolved: [],
    }
  }

  if (raw.catalog) {
    catalogs.push(
      createCatalogFromKeyValue('default', raw.catalog),
    )
  }

  if (raw.catalogs) {
    for (const key of Object.keys(raw.catalogs)) {
      catalogs.push(
        createCatalogFromKeyValue(key, raw.catalogs[key]),
      )
    }
  }

  return catalogs
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

export async function loadPackageJSON(
  relative: string,
  options: CommonOptions,
  shouldUpdate: (name: string) => boolean,
): Promise<PackageMeta[]> {
  const filepath = path.resolve(options.cwd ?? '', relative)
  const raw = await readJSON(filepath)
  const deps: RawDep[] = []

  for (const key of depsFields) {
    if (options.depFields?.[key] !== false) {
      if (key === 'packageManager') {
        if (raw.packageManager) {
          const [name, version] = raw.packageManager.split('@')
          deps.push(parseDependency(name, `^${version}`, 'packageManager', shouldUpdate))
        }
      }
      else {
        deps.push(...parseDependencies(raw, key, shouldUpdate))
      }
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
  }
  else {
    packagesNames = ['package.json']
  }

  if (existsSync(path.join(options.cwd || '', 'pnpm-workspace.yaml'))) {
    packagesNames.push('pnpm-workspace.yaml')
  }

  const packages = (await Promise.all(
    packagesNames.map(
      relative => loadPackage(relative, options, filter),
    ),
  )).flat()

  return packages.flat()
}
