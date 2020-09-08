import chalk from 'chalk'
import { SingleBar } from 'cli-progress'
import { colorizeDiff, TableLogger, createMultiProgresBar } from '../log'
import {
  CheckOptions,
  PackageMeta,
  ResolvedDependencies,
  DependenciesTypeShortMap,
} from '../types'
import { timeDifference } from '../utils/time'
import { CheckPackages } from '../api/check'

export async function check(options: CheckOptions) {
  const logger = new TableLogger({
    columns: 7,
    pending: 2,
    align: 'LLRRRRRR',
  })

  // progress bar
  const bars = createMultiProgresBar()
  console.log()
  let packagesBar: SingleBar | null = null
  const depBar = bars.create(1, 0)

  let hasChanges = false

  await CheckPackages(options, {
    afterPackagesLoaded(pkgs) {
      packagesBar = options.recursive
        ? bars.create(pkgs.length, 0, { type: chalk.cyan('pkg') })
        : null
    },
    beforePackageStart(pkg) {
      packagesBar?.increment(0, { name: chalk.cyan(pkg.name) })
      depBar.start(pkg.deps.length, 0, { type: chalk.green('dep') })
    },
    afterPackageEnd(pkg) {
      packagesBar?.increment(1)
      depBar.stop()

      const { relative, resolved } = pkg
      const changes = resolved.filter(i => i.update)
      if (changes.length)
        hasChanges = true

      printChanges(pkg, changes, relative, logger, options.showAll)
    },
    afterPackagesEnd(packages) {
      if (!options.showAll) {
        const counter = packages.reduce((counter, pkg) => {
          for (let i = 0; i < pkg.resolved.length; i++) {
            if (pkg.resolved[i].update)
              return ++counter
          }

          return counter
        }, 0)

        const last = packages.length - counter

        if (last > 0)
          logger.log(`${chalk.green(`${last} packages are already up-to-date`)}`)
      }
    },
    onDependencyResolved(pkgName, name, progress) {
      depBar.update(progress, { name })
    },
  })

  bars.stop()

  // TODO: summary

  // tips
  if (!options.write) {
    logger.log()

    if (options.mode === 'default')
      logger.log(`Run ${chalk.cyan('taze major')} to check major updates`)

    if (hasChanges)
      logger.log(`Run ${chalk.green('taze -w')} to write package.json`)

    logger.log()
  }
  else if (hasChanges) {
    logger.log(
      chalk.yellow(
        `changes wrote to package.json, run ${chalk.cyan(
          'npm i',
        )} to install updates.`,
      ),
    )
    logger.log()
  }

  logger.output()
}

export function printChanges(
  pkg: PackageMeta,
  changes: ResolvedDependencies[],
  filepath: string,
  logger: TableLogger,
  showAll: boolean,
) {
  if (changes.length) {
    logger.log(`${chalk.cyan(pkg.name)} ${chalk.gray(filepath)}`)
    logger.log()

    changes.forEach(
      ({
        name,
        currentVersion,
        targetVersion: latestVersion,
        source,
        currentVersionTime,
        targetVersionTime,
      }) =>
        logger.row(
          `  ${name}`,
          chalk.gray(DependenciesTypeShortMap[source]),
          timeDifference(currentVersionTime),
          chalk.gray(currentVersion),
          chalk.gray('→'),
          colorizeDiff(currentVersion, latestVersion),
          timeDifference(targetVersionTime),
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
        chalk.gray(
          `\n  ${Object.entries(counters)
            .map(([key, value]) => `${chalk.yellow(value)} ${key}`)
            .join(', ')} updates`,
        ),
      )
    }
  }
  else if (showAll) {
    logger.log(`${chalk.cyan(pkg.name)} ${chalk.gray(filepath)}`)
    logger.log()
    logger.log(`${chalk.gray('  ✓ up to date')}`)
  }

  const errors = pkg.resolved.filter(i => i.resolveError != null)

  if (errors.length) {
    logger.log()
    for (const dep of errors)
      printResolveError(dep, logger)
  }

  logger.log()
}

function printResolveError(dep: ResolvedDependencies, logger: TableLogger) {
  if (dep.resolveError == null)
    return

  if (dep.resolveError === '404') {
    logger.log(chalk.redBright(`> ${chalk.underline(dep.name)} not found`))
  }
  else if (dep.resolveError === 'invalid_range') {
    logger.log(
      chalk.yellowBright(
        `> ${chalk.underline(
          dep.name,
        )} has an unresolvable version range: ${chalk.underline(
          dep.currentVersion,
        )}`,
      ),
    )
  }
  else {
    logger.log(chalk.redBright(`> ${chalk.underline(dep.name)} unknown error`))
    logger.log(chalk.redBright(dep.resolveError.toString()))
  }
}
