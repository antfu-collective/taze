import type { DepType, RawDep, ResolvedDepChange } from '../types'

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
    .map(([name, { version, parents }]) => parseDependency(name, version, type, shouldUpdate, parents))
}

export function parseDependency(name: string, version: string, type: DepType, shouldUpdate: (name: string) => boolean, parents?: string[]): RawDep {
  return {
    name,
    currentVersion: version,
    parents,
    source: type,
    // when `updated` marked to `false`, it will be bypassed on resolving
    update: shouldUpdate(name),
  }
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

      if (i.aliasName === undefined)
        targetLeaf[i.name] = version
      else
        targetLeaf[i.aliasName] = `npm:${i.name}${version ? `@${version}` : ''}`
    })

  return data
}
