import type { CommonOptions, DepType, PackageMeta, RawDep } from '../types'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'pathe'
import { load, dump } from 'js-yaml'
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

function isDepFieldEnabled(key: DepType, options: CommonOptions): boolean {
  if (options.depFields?.[key] === false)
    return false
  if (key === 'peerDependencies')
    return !!options.peer
  return true
}

export async function readYAML(filepath: string): Promise<Record<string, unknown>> {
  const content = await readFile(filepath, 'utf-8')
  return load(content) as Record<string, unknown>
}

export async function writeYAML(filepath: string, data: Record<string, unknown>) {
  let fileIndent = '  ' // default indent
  
  try {
    const actualContent = await readFile(filepath, 'utf-8')
    fileIndent = detectIndent(actualContent).indent || '  '
  } catch {
    // File doesn't exist, use default indent
  }
  
  // Convert indent to spaces for YAML
  const indentSize = fileIndent === '\t' ? 2 : fileIndent.length || 2
  
  const yamlContent = dump(data, {
    indent: indentSize,
    noRefs: true,
    sortKeys: false,
    lineWidth: -1, // Disable line wrapping
  })
  
  return writeFile(filepath, yamlContent, 'utf-8')
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