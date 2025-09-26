import type { CommonOptions, DepType, PackageMeta, RawDep } from '../types'
import * as fs from 'node:fs/promises'
import { resolve } from 'pathe'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import detectIndent from 'detect-indent'
import { builtinAddons } from '../addons'
import { dumpDependencies, getByPath, parseDependencies, parseDependency, setByPath } from './dependencies'

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

const isDepFieldEnabled = (key: DepType, options: CommonOptions): boolean =>
  key === 'peerDependencies' ? !!options.peer : options.depFields?.[key] !== false

export async function readYAML(filepath: string): Promise<Record<string, unknown>> {
  const content = await fs.readFile(filepath, 'utf-8')
  if (!content)
    return {}

  const parsed = parseYaml(content)

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new TypeError(`Invalid package.yaml structure in ${filepath}`)

  return parsed as Record<string, unknown>
}


export async function writeYAML(filepath: string, data: Record<string, unknown>) {
  const { amount, type } = await fs.readFile(filepath, 'utf-8')
    .then(detectIndent)
    .catch(Object.create)

  const indent = (type === 'tab' ? 2 : amount) ?? 1

  const yamlContent = stringifyYaml(data, {
    indent,
    aliasDuplicateObjects: false,
    lineWidth: 0,
  }).replace(/^(\s*)"(@[^":]+)":/gm, `$1'$2':`)
  
  return fs.writeFile(filepath, yamlContent, 'utf-8')
}

export async function loadPackageYAML(
  relative: string,
  options: CommonOptions,
  shouldUpdate: (name: string) => boolean,
): Promise<PackageMeta[]> {
  const filepath = resolve(options.cwd ?? '', relative)
  const raw = await readYAML(filepath)
  const deps: RawDep[] = []

  for (const key of allDepsFields) {
    if (!isDepFieldEnabled(key, options))
      continue

    if (key === 'packageManager') {
      if (raw.packageManager && typeof raw.packageManager === 'string') {
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
      name: typeof raw.name === 'string' ? raw.name : '',
      private: !!raw.private,
      version: typeof raw.version === 'string' ? raw.version : '',
      type: 'package.yaml',
      relative,
      filepath,
      raw,
      deps,
      resolved: [],
    },
  ]
}

export async function writePackageYAML(
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
        pkg.raw ||= {}
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
    await writeYAML(pkg.filepath, pkg.raw || {})
  }
}