import chalk from 'chalk'
import { SingleBar, MultiBar, Presets } from 'cli-progress'
import { colorizeDiff, TableLogger } from './log'
import { CheckOptions, PackageMeta, ResolvedDependencies, DependenciesTypeShortMap, DependencyFilter, RawDependency } from './types'
import { loadPackages, writePackage } from './io/packages'
import { resolvePackage } from './io/resolves'
import { createFilterAction } from './utils/createFilterAction'

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

  const filterAction = createFilterAction(options.filter)

  // to filter out private dependency in monorepo
  const filter = (dep: RawDependency) => filterAction(dep.name) && !privatePackageNames.includes(dep.name)

  console.log()

  const bars = new MultiBar({
    clearOnComplete: true,
    hideCursor: true,
    format: `${chalk.cyan('{type}')} {bar} {value}/{total} ${chalk.gray('{name}')}`,
    linewrap: false,
    barsize: 40,
  }, Presets.shades_grey)

  const packagesBar = options.recursive ? bars.create(packages.length, 0, { type: 'pkg' }) : null
  const depBar = bars.create(1, 0, { type: 'dep' })

  for (const pkg of packages) {
    packagesBar?.increment(0, { name: pkg.name })
    await checkProject(pkg, options, filter, logger, depBar)
    packagesBar?.increment(1)
  }

  bars.stop()

  if (!options.write) {
    logger.log()
    if (options.mode === 'default')
      logger.log(`Run ${chalk.yellow('taze major')} to check major updates`)

    logger.log(`Run ${chalk.cyan('taze -w')} to write package.json`)
    logger.log()
  }

  logger.output()
}

export async function checkProject(pkg: PackageMeta, options: CheckOptions, filter: DependencyFilter, logger: TableLogger, bar: SingleBar) {
  bar.start(pkg.deps.length, 0, { type: 'dep' })

  await resolvePackage(pkg, options.mode, filter, (c, _, name) => {
    bar.update(c, { name })
  })

  bar.stop()

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
      logger.log(
        chalk.gray(`\n  ${
          Object
            .entries(counters)
            .map(([key, value]) => `${chalk.yellow(value)} ${key}`)
            .join(', ')
        } updates`),
      )
    }
  }

  logger.log()
}
