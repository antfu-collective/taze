import inquirer from 'inquirer'
import type { CheckOptions, DependencyFilter, DependencyResolvedCallback, PackageMeta, RangeMode, RawDependency } from '../types'
import { loadPackages, writePackage } from '../io/packages'
import { dumpCache, loadCache, resolvePackage } from '../io/resolves'
import { generateStringDependency } from '../utils/generateStringDependency'
import { DiffColors } from '../utils/diff'
import { groupDependencies } from '../utils/groupDependencies'
import type { TableLogger } from '../log'

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

export async function CheckPackages(options: CheckOptions, logger: TableLogger, callbacks: CheckEventCallbacks = {}) {
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
    await CheckSingleProject(pkg, options, filter, callbacks, logger)

    callbacks.afterPackageEnd?.(pkg)
  }

  callbacks.afterPackagesEnd?.(packages)

  dumpCache()

  return {
    packages,
  }
}

async function CheckSingleProject(pkg: PackageMeta, options: CheckOptions, filter: DependencyFilter = () => true, callbacks: CheckEventCallbacks = {}, logger: TableLogger) {
  await resolvePackage(pkg, options.mode as RangeMode, filter, callbacks.onDependencyResolved)

  const { resolved } = pkg
  const changes = resolved.filter(i => i.update)

  if (options.write && changes.length) {
    const shouldWrite = await Promise.resolve(callbacks.beforePackageWrite?.(pkg))

    if (options.interactive) {
      callbacks.beforeInteractivePackage?.(pkg)

      const groupedDependencies = groupDependencies(changes)

      const choices = []

      for (const group in groupedDependencies) {
        const groupName = group as keyof typeof groupedDependencies

        let lineSeparator = `${DiffColors[groupName](group.charAt(0).toUpperCase() + group.slice(1))}`

        if (Object.keys(groupedDependencies)[0] !== group)
          lineSeparator = `\n${lineSeparator}`

        choices.push({
          type: 'separator',
          name: 'separator',
          line: lineSeparator,
          value: 'separator',
        })

        choices.push(...groupedDependencies[groupName].map((change) => {
          const depIndex = pkg.resolved.findIndex(a => a.name === change.name)

          if (depIndex !== -1)
            pkg.resolved[depIndex].update = false

          const logs = logger.getStringRow(changes.map(change => generateStringDependency(change)))

          return {
            name: logs.find(log => log.startsWith(change.name))?.slice(0, -1),
            short: change.name,
            value: change.name,
          }
        }))
      }

      const result = await inquirer.prompt({
        // @ts-expect-error Seems like an error in inquirer types...
        type: 'checkbox',
        loop: false,
        pageSize: process.stdout.rows - 2,
        name: 'dependencies',
        choices,
        message: 'Choose the packages to update',
      })

      for (const dependency of result.dependencies) {
        const depIndex = pkg.resolved.findIndex(a => a.name === dependency)

        if (depIndex !== -1)
          pkg.resolved[depIndex].update = true
      }
    }

    if (shouldWrite !== false) {
      // await writePackage(pkg, options)
      callbacks.afterPackageWrite?.(pkg)
    }
  }
  return pkg
}
