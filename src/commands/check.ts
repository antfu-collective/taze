import { green, cyan, magenta, yellow, dim, gray, underline, redBright, yellowBright } from 'chalk'
import { SingleBar } from 'cli-progress'
import { run, parseNi, parseNu } from '@antfu/ni'
import { colorizeVersionDiff, TableLogger, createMultiProgresBar } from '../log'
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
    columns: 8,
    pending: 2,
    align: 'LLRRRRRL',
    loglevel: options.loglevel,
  })

  // progress bar
  const bars = options.loglevel === 'silent' ? null : createMultiProgresBar()
  logger.log()
  let packagesBar: SingleBar | undefined
  const depBar = bars?.create(1, 0)

  let hasChanges = false

  await CheckPackages(options, {
    afterPackagesLoaded(pkgs) {
      packagesBar = options.recursive && pkgs.length
        ? bars?.create(pkgs.length, 0, { type: cyan`pkg`, name: cyan(pkgs[0].name) })
        : undefined
    },
    beforePackageStart(pkg) {
      packagesBar?.increment(0, { name: cyan(pkg.name) })
      depBar?.start(pkg.deps.length, 0, { type: green`dep` })
    },
    afterPackageEnd(pkg) {
      packagesBar?.increment(1)
      depBar?.stop()

      const { relative, resolved } = pkg
      const changes = resolved.filter(i => i.update)
      if (changes.length)
        hasChanges = true

      printChanges(pkg, changes, relative, logger, options)
    },
    afterPackagesEnd(packages) {
      if (!options.all) {
        const counter = packages.reduce((counter, pkg) => {
          for (let i = 0; i < pkg.resolved.length; i++) {
            if (pkg.resolved[i].update)
              return ++counter
          }

          return counter
        }, 0)

        const last = packages.length - counter

        if (last === 1)
          logger.log(green`dependencies are already up-to-date in one package`)
        else if (last > 0)
          logger.log(green`dependencies are already up-to-date in ${last} packages`)
      }
    },
    onDependencyResolved(pkgName, name, progress) {
      depBar?.update(progress, { name })
    },
  })

  bars?.stop()

  // tips
  if (!options.write) {
    logger.log()

    if (options.mode === 'default')
      logger.log(`Run ${cyan`taze major`} to check major updates`)

    if (hasChanges)
      logger.log(`Run ${green`taze -w`} to write package.json`)

    logger.log()
  }
  else if (hasChanges) {
    if (!options.install && !options.update) {
      logger.log(
        yellow`changes wrote to package.json, run ${cyan`npm i`} to install updates.`,
      )
    }

    if (options.install || options.update)
      logger.log(yellow`changes wrote to package.json`)

    if (options.install) {
      logger.log(magenta`installing...`)
      logger.log()
    }

    if (options.write && options.install) {
      logger.output()
      await run(parseNi, [])
    }

    if (options.update) {
      logger.log(magenta`updating...`)
      logger.log()
    }

    if (options.write && options.update) {
      logger.output()
      await run(parseNu, options.recursive ? ['-r'] : [])
    }
  }
}

export function printChanges(
  pkg: PackageMeta,
  changes: ResolvedDependencies[],
  filepath: string,
  logger: TableLogger,
  options: CheckOptions,
) {
  if (changes.length) {
    logger.log(`${cyan(pkg.name ?? '›')} ${dim(filepath)}`)
    logger.log()

    changes.forEach(
      ({
        name,
        currentVersion,
        targetVersion,
        source,
        currentVersionTime,
        targetVersionTime,
        latestVersionAvaliable,
      }) =>
        logger.row(
          `  ${name}`,
          gray(DependenciesTypeShortMap[source]),
          timeDifference(currentVersionTime),
          gray(currentVersion),
          gray`→`,
          colorizeVersionDiff(currentVersion, targetVersion),
          timeDifference(targetVersionTime),
          latestVersionAvaliable ? magenta`  (${latestVersionAvaliable} avaliable)` : '',
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
        gray`\n  ${
          Object.entries(counters)
            .map(([key, value]) => `${yellow(value)} ${key}`)
            .join(', ')
        } updates`,
      )
    }
  }
  else if (options.all) {
    logger.log(`${cyan(pkg.name)} ${dim(filepath)}`)
    logger.log()
    logger.log(gray`  ✓ up to date`)
  }

  const errors = pkg.resolved.filter(i => i.resolveError != null)

  if (errors.length) {
    logger.log()
    for (const dep of errors)
      printResolveError(dep, logger, options)
  }

  logger.log()
}

function printResolveError(dep: ResolvedDependencies, logger: TableLogger, options: CheckOptions) {
  if (dep.resolveError == null)
    return

  if (dep.resolveError === '404') {
    logger.error(redBright`> ${underline(dep.name)} not found`)
  }
  else if (dep.resolveError === 'invalid_range') {
    logger.warn(
      yellowBright`> ${
        underline(dep.name)
      } has an unresolvable version range: ${
        underline(dep.currentVersion)
      }`,
    )
  }
  else {
    logger.error(redBright`> ${underline(dep.name)} unknown error`)
    logger.error(redBright(dep.resolveError.toString()))
  }
}
