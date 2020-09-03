import chalk from 'chalk'
import { CheckOptions, RawDependency, PackageMeta, DependencyFilter, RangeMode, DependencyResolvedCallback } from '../types'
import { loadPackages, writePackage } from '../io/packages'
import { resolvePackage } from '../io/resolves'
import { TableLogger } from '../log'
export interface CheckEventCallbacks {
  afterPackagesLoaded?: (pkgs: PackageMeta[]) => void
  beforePackageStart?: (pkg: PackageMeta) => void
  afterPackageEnd?: (pkg: PackageMeta) => boolean
  beforePackageWrite?: (pkg: PackageMeta) => boolean | Promise<boolean>
  afterPackageWrite?: (pkg: PackageMeta) => void
  onDependencyResolved?: DependencyResolvedCallback
}

export async function CheckPackages(options: CheckOptions, tableLogger: TableLogger, callbacks: CheckEventCallbacks = {}) {
  // packages loading
  const packages = await loadPackages(options)
  callbacks.afterPackagesLoaded?.(packages)

  const privatePackageNames = packages
    .filter(i => i.raw.private)
    .map(i => i.raw.name)
    .filter(i => i)

  // to filter out private dependency in monorepo
  const filter = (dep: RawDependency) => !privatePackageNames.includes(dep.name)

  let counter = 0

  for (const pkg of packages) {
    callbacks.beforePackageStart?.(pkg)
    await CheckSingleProject(pkg, options, filter, callbacks)

    if (!callbacks.afterPackageEnd?.(pkg))
      counter++
  }

  tableLogger.log(`${chalk.green(`${counter} packages are already up-to-date`)}`)

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
