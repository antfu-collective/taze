import type { DepType, PackageType, RawDep, ResolvedDepChange } from '../types'

interface FlattenPkgData { [key: string]: { version: string, parents: string[] } }

function flatten(obj: any, parents: string[] = []): FlattenPkgData {
  if (!obj)
    return obj

  let flattenData: FlattenPkgData = {}
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'object')
      flattenData = { ...flattenData, ...flatten(value, [...parents, key]) }
    else if (typeof value === 'string')
      flattenData[key] = { version: value, parents }
  }
  return flattenData
}

export function getByPath(obj: any, path: string) {
  return flatten(path.split('.').reduce((o, i) => o?.[i], obj))
}

export function setByPath(obj: any, path: string, value: any) {
  const keys = path.split('.')
  const lastKey = keys.pop() as string
  const target = keys.reduce((o, i) => o[i] = o[i] || {}, obj)
  target[lastKey] = value
}

export function parseDependencies(
  pkg: any,
  type: DepType,
  shouldUpdate: (name: string) => boolean,
): RawDep[] {
  return Object.entries(getByPath(pkg, type) || {})
    .map(([name, { version, parents }]) => parseDependency({ name, version, type, shouldUpdate, parents }))
}

export function parseDependency({
  name,
  version,
  type,
  packageType,
  shouldUpdate,
  parents,
  hexHash,
}: {
  name: string
  version: string
  type: DepType
  packageType?: PackageType
  shouldUpdate: (name: string) => boolean
  parents?: string[]
  hexHash?: string
}): RawDep {
  // Route `jsr:` specifiers (e.g. `"@std/cli": "jsr:^1.0.0"`) to the jsr
  // registry. Other specifiers default to npm. An explicit `packageType`
  // (e.g. from the GitHub Actions manifest) always wins.
  const resolvedPackageType: PackageType = packageType
    ?? (version.startsWith('jsr:') ? 'jsr' : 'npm')
  const dep: RawDep = {
    name,
    currentVersion: version,
    parents,
    source: type,
    packageType: resolvedPackageType,
    // when `updated` marked to `false`, it will be bypassed on resolving
    update: shouldUpdate(name),
  }
  if (hexHash) {
    dep.hexHash = hexHash
  }
  return dep
}

export function dumpDependencies(deps: ResolvedDepChange[], type: DepType) {
  const data: Record<string, any> = {}
  deps
    .filter(i => i.source === type)
    .sort((a, b) => (a.aliasName || a.name).localeCompare(b.aliasName || b.name))
    .forEach((i) => {
      const version = i.update ? i.targetVersion : i.currentVersion
      let targetLeaf = data

      i.parents?.reduce((tree, parent) => {
        tree[parent] ??= {}
        targetLeaf = tree[parent]
        return tree[parent]
      }, data)

      if (i.aliasName === undefined && !i.protocol) {
        targetLeaf[i.name] = version
      }
      else {
        // The `jsr:` protocol carries only a version (the package name comes
        // from the key); `npm:` aliases carry `name@version`.
        const key = i.aliasName ?? i.name
        const protocol = i.protocol ? `${i.protocol}:` : ''
        targetLeaf[key] = `${protocol}${i.protocol === 'jsr' ? version : buildNpmTargetPackage(i, version)}`
      }
    })

  return data
}

function buildNpmTargetPackage(dep: ResolvedDepChange, version: string) {
  const versionPart = version ? `@${version}` : ''
  return `${dep.name}${versionPart}`
}
