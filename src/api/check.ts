import type { CheckOptions, DependencyFilter, DependencyResolvedCallback, PackageMeta, RawDep } from '../types'
import { loadPackages, writePackage } from '../io/packages'
import { dumpCache, loadCache, resolvePackage } from '../io/resolves'

export interface CheckEventCallbacks {
  afterPackagesLoaded?: (pkgs: PackageMeta[]) => void
  beforePackageStart?: (pkg: PackageMeta) => void
  afterPackageEnd?: (pkg: PackageMeta) => void
  beforePackageWrite?: (pkg: PackageMeta) => boolean | Promise<boolean>
  afterPackagesEnd?: (pkgs: PackageMeta[]) => void
  afterPackageWrite?: (pkg: PackageMeta) => void
  onDependencyResolved?: DependencyResolvedCallback
}

export async function CheckPackages(options: CheckOptions, callbacks: CheckEventCallbacks = {}) {
  if (!options.force)
    await loadCache()

  // packages loading
  const packages = await loadPackages(options)
  callbacks.afterPackagesLoaded?.(packages)

  const privatePackageNames = packages
    .filter(i => i.raw.private)
    .map(i => i.raw.name)
    .filter(i => i)

  // to filter out private dependency in monorepo
  const filter = (dep: RawDep) => !privatePackageNames.includes(dep.name)

  for (const pkg of packages) {
    callbacks.beforePackageStart?.(pkg)
    await CheckSingleProject(pkg, options, filter, callbacks)

    callbacks.afterPackageEnd?.(pkg)
  }

  callbacks.afterPackagesEnd?.(packages)

  await dumpCache()

  return {
    packages,
  }
}

async function CheckSingleProject(pkg: PackageMeta, options: CheckOptions, filter: DependencyFilter = () => true, callbacks: CheckEventCallbacks = {}) {
  await resolvePackage(pkg, options, filter, callbacks.onDependencyResolved)

  const { resolved } = pkg
  const changes = resolved.filter(i => i.update)

  if (options.write && changes.length) {
    const shouldWrite = await Promise.resolve(callbacks.beforePackageWrite?.(pkg))

    if (shouldWrite !== false) {
      await writePackage(pkg, options)
      callbacks.afterPackageWrite?.(pkg)
    }
  }
  return pkg
}
