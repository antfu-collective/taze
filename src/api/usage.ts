import type { DependencyResolvedCallback, PackageMeta, UsageOptions } from '../types'
import { loadPackages } from '../io/packages'
import { getPackageData } from '../io/resolves'

export interface UsageEventCallbacks {
  onLoaded?: (usages: UnresolvedUsage[]) => void
  onDependencyResolved?: DependencyResolvedCallback
}

export interface UnresolvedUsage {
  name: string
  versionMap: Record<string, PackageMeta[]>
}

export interface ResolvedUsage extends UnresolvedUsage {
  latest?: string
}

export async function checkUsages(options: UsageOptions, callbacks: UsageEventCallbacks = {}) {
  const packages = await loadPackages(options)
  const names: Record<string, Record<string, PackageMeta[]>> = {}

  for (const pkg of packages) {
    const depName = pkg.deps[0].name // only need to check the first dependency
    const depVersion = pkg.deps[0].currentVersion
    if (!names[depName])
      names[depName] = {}
    if (!names[depName][depVersion])
      names[depName][depVersion] = []
    names[depName][depVersion].push(pkg)
  }

  const usages: UnresolvedUsage[] = Object.entries(names)
  // only check deps with more then 1 version in use
    .filter(i => Object.keys(i[1]).length > 1)
  // sort by the number of versions
    .sort((a, b) => Object.keys(b[1]).length - Object.keys(a[1]).length)
    .map(([name, versionMap]) => ({ name, versionMap }))

  callbacks.onLoaded?.(usages)

  let progress = 0
  const total = usages.length

  const resolveUsages = await Promise.all(
    usages.map(async ({ name, versionMap }) => {
      const { tags } = await getPackageData(name)
      progress += 1
      callbacks.onDependencyResolved?.(null, name, progress, total)
      return { name, versionMap, latest: tags.latest || '' }
    }),
  )

  return resolveUsages
}
