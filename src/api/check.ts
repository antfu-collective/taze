import prompts from 'prompts'
import type { CheckOptions, DependencyFilter, DependencyResolvedCallback, PackageMeta, RangeMode, RawDependency } from '../types'
import { loadPackages, writePackage } from '../io/packages'
import { dumpCache, loadCache, resolvePackage } from '../io/resolves'
import { generateStringDependency } from '../utils/generateStringDependency'

export interface CheckEventCallbacks {
  afterPackagesLoaded?: (pkgs: PackageMeta[]) => void
  beforePackageStart?: (pkg: PackageMeta) => void
  afterPackageEnd?: (pkg: PackageMeta) => void
  beforePackageWrite?: (pkg: PackageMeta) => boolean | Promise<boolean>
  beforeInteractivePackage?: (pkg: PackageMeta) => void
  afterPackagesEnd?: (pkgs: PackageMeta[]) => void
  afterPackageWrite?: (pkg: PackageMeta) => void
  onDependencyResolved?: DependencyResolvedCallback
}

export async function CheckPackages(options: CheckOptions, callbacks: CheckEventCallbacks = {}) {
  if (!options.force)
    loadCache()

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

  callbacks.afterPackagesEnd?.(packages)

  dumpCache()

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

    if (options.interactive) {
      callbacks.beforeInteractivePackage?.(pkg)

      for (const indexChange in changes) {
        const change = changes[indexChange]

        const response = await prompts({
          type: 'confirm',
          name: 'updateDependency',
          message: `Upgrade ${generateStringDependency(change)}`,
          initial: true,
        })

        if (!response.updateDependency) {
          const depIndex = pkg.resolved.findIndex(a => a.name === change.name)

          if (depIndex !== -1)
            pkg.resolved[depIndex] = { ...pkg.resolved[depIndex], update: false }
        }
      }
    }

    if (shouldWrite !== false) {
      await writePackage(pkg, options)
      callbacks.afterPackageWrite?.(pkg)
    }
  }
  return pkg
}
