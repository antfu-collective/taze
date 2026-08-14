import type { Document as DocumentType } from 'yaml'
import type { CommonOptions, PackageMeta } from '../../types'
import type { Manifest } from '../types'
import * as fs from 'node:fs/promises'
import detectIndent from 'detect-indent'
import { resolve } from 'pathe'
import { Document, parseDocument as parseYaml, stringify as stringifyYaml } from 'yaml'
import { builtinAddons } from '../../addons'
import { dumpDependencies, getByPath, parseDependency } from '../dependencies'
import { dumpDependencyFields, parseDependencyFields } from '../fields'

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

async function writeYAML(filepath: string, data: DocumentType | Record<string, unknown>) {
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

async function loadPackageYAML(
  relative: string,
  options: CommonOptions,
  shouldUpdate: (name: string) => boolean,
): Promise<PackageMeta[]> {
  const filepath = resolve(options.cwd ?? '', relative)
  const doc = await readYAML(filepath)

  const deps = parseDependencyFields(doc.toJS(), options, shouldUpdate, () => {
    const packageManager = doc.get('packageManager')
    if (typeof packageManager !== 'string')
      return undefined
    const [name, version] = packageManager.split('@')
    // `+` sign can be used to pin the hash of the package manager, we remove it to be semver compatible.
    return parseDependency({ name, version: `^${version.split('+')[0]}`, type: 'packageManager', shouldUpdate })
  })

  return [
    {
      name: doc.get('name') as string ?? '',
      private: !!doc.get('private'),
      version: doc.get('version') as string ?? '',
      type: 'package.yaml',
      relative,
      filepath,
      get raw() {
        return doc.toJS()
      },
      deps,
      yamlDocument: doc,
      resolved: [],
    },
  ]
}

export async function writePackageYAML(
  pkg: PackageMeta,
  options: CommonOptions,
) {
  if (pkg.type !== 'package.yaml') {
    throw new Error('Package type is not supported')
  }

  const doc = pkg.yamlDocument || new Document(pkg.raw)

  const changed = dumpDependencyFields(pkg.resolved, options, {
    has: key => !!getByPath(doc.toJS(), key),
    set: (key, values) => {
      Object.entries(values).forEach(([lastKey, value]) =>
        doc.setIn([...key.split('.'), lastKey], value))
    },
    setPackageManager: () => {
      const [value] = Object.entries(dumpDependencies(pkg.resolved, 'packageManager'))
      if (!value)
        return false
      doc.set('packageManager', `${value[0]}@${value[1].replace('^', '')}`)
      return true
    },
  })

  if (changed) {
    for (const addon of (options.addons || builtinAddons)) {
      await addon.beforeWrite?.(pkg, options)
    }
    await writeYAML(pkg.filepath, doc)
  }
}

export const packageYamlManifest: Manifest = {
  name: 'package.yaml',
  type: 'package.yaml',
  match: filepath => filepath.endsWith('package.yaml'),
  load: loadPackageYAML,
  write: writePackageYAML,
}
