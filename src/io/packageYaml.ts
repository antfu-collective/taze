import type { Document as DocumentType } from 'yaml'
import type { CommonOptions, DepType, PackageMeta, RawDep } from '../types'
import * as fs from 'node:fs/promises'
import detectIndent from 'detect-indent'
import { resolve } from 'pathe'
import { Document, parseDocument as parseYaml, stringify as stringifyYaml } from 'yaml'
import { builtinAddons } from '../addons'
import { dumpDependencies, getByPath, parseDependencies, parseDependency } from './dependencies'

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
  return key === 'peerDependencies' ? !!options.peer : options.depFields?.[key] !== false
}

export async function readYAML(filepath: string): Promise<DocumentType> {
  const content = await fs.readFile(filepath, 'utf-8')
  if (!content)
    return new Document({})

  const document = parseYaml(content, { merge: true })
  const parsed = document.toJS()

  if (document.errors.length || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new TypeError(`Invalid package.yaml structure in ${filepath}`)

  return document
}

export async function writeYAML(filepath: string, data: DocumentType | Record<string, unknown>) {
  const { amount, type } = await fs.readFile(filepath, 'utf-8')
    .then(detectIndent)
    .catch(Object.create)

  const indent = (type === 'tab' ? 2 : amount) ?? 2

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
      const packageManager = raw.get(key)
      if (typeof packageManager === 'string') {
        const [name, version] = packageManager.split('@')
        // `+` sign can be used to pin the hash of the package manager, we remove it to be semver compatible.
        deps.push(parseDependency(name, `^${version.split('+')[0]}`, 'packageManager', shouldUpdate))
      }
    }
    else {
      deps.push(...parseDependencies(raw.toJS(), key, shouldUpdate))
    }
  }

  return [
    {
      name: raw.get('name') as string ?? '',
      private: !!raw.get('private'),
      version: raw.get('version') as string ?? '',
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
      const [value] = Object.entries(dumpDependencies(pkg.resolved, 'packageManager'))
      if (value) {
        pkg.raw ??= new Document({})
        pkg.raw.set('packageManager', `${value[0]}@${value[1].replace('^', '')}`)
        changed = true
      }
    }
    else {
      if (getByPath(pkg.raw?.toJS?.(), key)) {
        const values = Object.entries(dumpDependencies(pkg.resolved, key))
        values.forEach(([lastKey, value]) =>
          pkg.raw?.setIn([...key.split('.'), lastKey], value))
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
