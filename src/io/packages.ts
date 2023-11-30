import path from 'node:path'
import { promises as fs } from 'node:fs'
import fg from 'fast-glob'
import detectIndent from 'detect-indent'
import type { CommonOptions, PackageMeta, RawDep } from '../types'
import { createDependenciesFilter } from '../utils/dependenciesFilter'
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

export async function writePackage(pkg: PackageMeta, options: CommonOptions) {
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

export async function loadPackage(
  relative: string,
  options: CommonOptions,
  shouldUpdate: (name: string) => boolean,
): Promise<PackageMeta> {
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

  return {
    name: raw.name,
    version: raw.version,
    relative,
    filepath,
    raw,
    deps,
    resolved: [],
  }
}

export async function loadPackages(options: CommonOptions) {
  let packagesNames: string[] = []

  const filter = createDependenciesFilter(options.include, options.exclude)

  if (options.recursive) {
    packagesNames = await fg('**/package.json', {
      ignore: [
        '**/node_modules/**',
        '**/dist/**',
        '**/public/**',
      ].concat(options.ignorePaths || []),
      cwd: options.cwd,
      onlyFiles: true,
    })
  }
  else {
    packagesNames = ['package.json']
  }

  const packages = await Promise.all(
    packagesNames.map(
      relative => loadPackage(relative, options, filter),
    ),
  )

  return packages
}
