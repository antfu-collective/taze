import path from 'node:path'
import type { CommonOptions, PackageMeta, RawDep } from '../types'
import { dumpDependencies, getByPath, parseDependencies, parseDependency, setByPath } from './dependencies'
import { readJSON, writeJSON } from './packages'

const depsFields = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'packageManager',
  'pnpm.overrides',
  'resolutions',
  'overrides',
] as const

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
