import { CheckOptions, RawDependency, PackageMeta, DependencyFilter, RangeMode, DependencyResolvedCallback } from '../types'
import { loadPackages, writePackage } from '../io/packages'
import { resolvePackage } from '../io/resolves'

export interface CheckEventCallbacks {
  afterPackagesLoaded?: (pkgs: PackageMeta[]) => void
  beforePackageStart?: (pkg: PackageMeta) => void
  afterPackageEnd?: (pkg: PackageMeta) => void
  beforePackageWrite?: (pkg: PackageMeta) => boolean | Promise<boolean>
  afterPackageWrite?: (pkg: PackageMeta) => void
  onDependencyResolved?: DependencyResolvedCallback
}

export async function CheckPackages(options: CheckOptions, callbacks: CheckEventCallbacks = {}) {
  // packages loading
  const packages = await loadPackages(options)
  callbacks.afterPackagesLoaded?.(packages)

  const privatePackageNames = packages
    .filter(i => i.raw.private)
    .map(i => i.raw.name)
    .filter(i => i)

  // to filter out private dependency in monorepo
  const filter = (dep: RawDependency) => !privatePackageNames.includes(dep.name)

  for (const pkg of packages) {
    callbacks.beforePackageStart?.(pkg)
    await CheckSingleProject(pkg, options, filter, callbacks)
    callbacks.afterPackageEnd?.(pkg)
  }

  return {
    packages,
  }
}

async function CheckSingleProject(pkg: PackageMeta, options: CheckOptions, filter: DependencyFilter = () => true, callbacks: CheckEventCallbacks = {}) {
  await resolvePackage(pkg, options.mode as RangeMode, filter, callbacks.onDependencyResolved)

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
