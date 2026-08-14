import type { CheckOptions, DependencyFilter, DependencyResolvedCallback, PackageMeta, PackageType, RawDep, ResolvedDepChange } from '../types'
import type { Registry } from './types'
import { newQueue } from '@henrygd/queue'
import { diffSorter } from '../filters/diff-sorter'
import { queueContext } from '../utils/context'
import { githubActionsRegistry } from './github-actions'
import { npmRegistry } from './npm'

export { dumpCache, loadCache } from './cache'

export { githubActionsRegistry } from './github-actions'
export { getGitHubActionData, getGitHubActionDiff, resolveGitHubAction } from './github-actions/registry'
export { npmRegistry } from './npm'
export {
  getFilteredVersions,
  getLatestVersionAvailable,
  getPackageData,
  getVersionOfRange,
  getVersionOfTag,
  isAliasedPackage,
  isLocalPackage,
  isUrlPackage,
  resolveNpmDependency,
  updateTargetVersion,
} from './npm/registry'
export { getDiff, mergeMode } from './shared'
export type { Registry } from './types'

/**
 * All available registries, keyed by their {@link PackageType}. This is the
 * package-type axis registry — add an ecosystem by registering it here.
 */
export const registries = {
  'npm': npmRegistry,
  'github-actions': githubActionsRegistry,
} satisfies Record<PackageType, Registry>

export function getRegistry(packageType: PackageType = 'npm'): Registry {
  return registries[packageType] ?? registries.npm
}

export async function resolveDependency(
  raw: RawDep,
  options: CheckOptions,
  filter: DependencyFilter = () => true,
): Promise<ResolvedDepChange> {
  return getRegistry(raw.packageType).resolve(raw, options, filter)
}

export async function resolveDependencies(
  deps: RawDep[],
  options: CheckOptions,
  filter: DependencyFilter = () => true,
  progressCallback: (name: string, counter: number, total: number) => void = () => {},
) {
  const total = deps.length
  let counter = 0

  const {
    concurrency = 10,
  } = options

  // resolveDependencies may be called standalone without going through CheckPackages, so we need
  // to fallback (that respects concurrency option) if it's not in the CheckPackages context.
  const queue = queueContext.getStore() || newQueue(concurrency)

  return Promise.all(
    deps.map(raw => queue.add(async () => {
      const dep = await resolveDependency(raw, options, filter)
      counter += 1
      progressCallback(raw.name, counter, total)
      return dep
    })),
  )
}

export async function resolvePackage(pkg: PackageMeta, options: CheckOptions, filter?: DependencyFilter, progress?: DependencyResolvedCallback) {
  const resolved = await resolveDependencies(pkg.deps, options, filter, (name, counter, total) => progress?.(pkg.name, name, counter, total))
  diffSorter(resolved)
  pkg.resolved = resolved
  return pkg
}
