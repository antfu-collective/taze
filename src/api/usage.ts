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

export async function CheckUsages(options: UsageOptions, callbacks: UsageEventCallbacks = {}) {
  const packages = await loadPackages(options)
  const names: Record<string, Record<string, PackageMeta[]>> = {}

  for (const pkg of packages) {
    for (const dep of pkg.deps) {
      if (!names[dep.name])
        names[dep.name] = {}
      if (!names[dep.name][dep.currentVersion])
        names[dep.name][dep.currentVersion] = []

      names[dep.name][dep.currentVersion].push(pkg)
    }
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
