import chalk from 'chalk'
import { colorizeDiff, TableLogger } from './log'
import { CheckOptions, PackageMeta, ResolvedDependencies, DependenciesTypeShortMap, DependencyFilter, RawDependency } from './types'
import { loadPackages, writePackage } from './io/packages'
import { resolvePackage } from './io/resolves'

export async function check(options: CheckOptions) {
  const logger = new TableLogger({
    columns: 5,
    pending: 2,
    align: 'LLRRR',
  })

  const packages = await loadPackages(options)
  const privatePackageNames = packages
    .filter(i => i.raw.private)
    .map(i => i.raw.name)
    .filter(i => i)

  const filter = (dep: RawDependency) => {
    // to filter out private dependency in monorepo
    return !privatePackageNames.includes(dep.name)
  }

  logger.log()

  for (const pkg of packages)
    await checkProject(pkg, options, filter, logger)

  logger.log()
  if (options.mode === 'default')
    logger.log(`Run ${chalk.yellow('taze major')} to check major updates`)

  logger.log(`Run ${chalk.cyan('taze -w')} to write package.json`)
  logger.log()

  logger.output()
}

export async function checkProject(pkg: PackageMeta, options: CheckOptions, filter: DependencyFilter, logger: TableLogger) {
  await resolvePackage(pkg, options.mode, filter)
  const { relative, resolved } = pkg
  const changes = resolved.filter(i => i.update)

  printChanges(pkg, changes, relative, logger)

  if (options.write && changes.length) {
    await writePackage(pkg)

    logger.log(chalk.yellow('changes wrote to package.json'))
    logger.log()
  }
}

export function printChanges(pkg: PackageMeta, changes: ResolvedDependencies[], filepath: string, logger: TableLogger) {
  logger.log(`${chalk.cyan(pkg.name)} ${chalk.gray(filepath)}`)
  logger.log()

  if (!changes.length) {
    logger.log(chalk.gray('  ✓ up to date'))
  }
  else {
    changes.forEach(({ name, currentVersion, latestVersion, source }) =>
      logger.row(
        `  ${name}`,
        chalk.gray(DependenciesTypeShortMap[source]),
        chalk.gray(currentVersion),
        chalk.gray('→'),
        colorizeDiff(currentVersion, latestVersion),
      ),
    )

    const counters: Record<string, number> = {}

    changes.forEach(({ diff }) => {
      if (!diff)
        return
      if (!counters[diff])
        counters[diff] = 0
      counters[diff] += 1
    })

    if (Object.keys(counters).length) {
      logger.log(`\n  ${
        Object
          .entries(counters)
          .map(([key, value]) => `${value} ${key}`)
          .join(', ')
      } updates`)
    }
  }

  logger.log()
}
