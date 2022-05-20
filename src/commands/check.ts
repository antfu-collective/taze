import c from 'picocolors'
import type { SingleBar } from 'cli-progress'
import { parseNi, parseNu, run } from '@antfu/ni'
import { TableLogger, createMultiProgresBar } from '../log'
import type {
  CheckOptions,
  PackageMeta,
  ResolvedDependencies,
} from '../types'
import { CheckPackages } from '../api/check'
import { generateStringDependency } from '../utils/generateStringDependency'

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

  await CheckPackages(options, logger, {
    afterPackagesLoaded(pkgs) {
      packagesBar = options.recursive && pkgs.length
        ? bars?.create(pkgs.length, 0, { type: c.cyan('pkg'), name: c.cyan(pkgs[0].name) })
        : undefined
    },
    beforePackageStart(pkg) {
      packagesBar?.increment(0, { name: c.cyan(pkg.name) })
      depBar?.start(pkg.deps.length, 0, { type: c.green('dep') })
    },
    beforeInteractivePackage() {
      depBar?.stop()
      depBar?.render() // Clear the bar
      process.stdout.write('\n')
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
          logger.log(c.green('dependencies are already up-to-date in one package'))
        else if (last > 0)
          logger.log(c.green(`dependencies are already up-to-date in ${last} packages`))
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
      logger.log(`Run ${c.cyan('taze major')} to check major updates`)

    if (hasChanges)
      logger.log(`Run ${c.green('taze -w')} to write package.json`)

    logger.log()
  }
  else if (hasChanges) {
    if (!options.install && !options.update) {
      logger.log(
        c.yellow(`changes wrote to package.json, run ${c.cyan('npm i')} to install updates.`),
      )
    }

    if (options.install || options.update)
      logger.log(c.yellow('changes wrote to package.json'))

    if (options.install) {
      logger.log(c.magenta('installing...'))
      logger.log()

      logger.output()
      await run(parseNi, [])
    }

    if (options.update) {
      logger.log(c.magenta('updating...'))
      logger.log()

      logger.output()
      await run(parseNu, options.recursive ? ['-r'] : [])
    }
  }

  logger.output()
}

export function printChanges(
  pkg: PackageMeta,
  changes: ResolvedDependencies[],
  filepath: string,
  logger: TableLogger,
  options: CheckOptions,
) {
  if (changes.length) {
    logger.log(`${c.cyan(pkg.name ?? '›')} ${c.dim(filepath)}`)
    logger.log()

    changes.forEach((change) => {
      const result = generateStringDependency(change)

      result[0] = `  ${result[0]}`

      return logger.row(...result)
    })

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
        c.gray(`\n  ${
          Object.entries(counters)
            .map(([key, value]) => `${c.yellow(value)} ${key}`)
            .join(', ')
        } updates`),
      )
    }
  }
  else if (options.all) {
    logger.log(`${c.cyan(pkg.name)} ${c.dim(filepath)}`)
    logger.log()
    logger.log(c.gray('  ✓ up to date'))
  }

  const errors = pkg.resolved.filter(i => i.resolveError != null)

  if (errors.length) {
    logger.log()
    for (const dep of errors)
      printResolveError(dep, logger/* , options */)
    logger.log()
  }
}

function printResolveError(dep: ResolvedDependencies, logger: TableLogger/* , options: CheckOptions */) {
  if (dep.resolveError == null)
    return

  if (dep.resolveError === '404') {
    logger.error(c.red(`> ${c.underline(dep.name)} not found`))
  }
  else if (dep.resolveError === 'invalid_range') {
    logger.warn(
      c.yellow(`> ${
        c.underline(dep.name)
      } has an unresolvable version range: ${
        c.underline(dep.currentVersion)
      }`),
    )
  }
  else {
    logger.error(c.red(`> ${c.underline(dep.name)} unknown error`))
    logger.error(c.red(dep.resolveError.toString()))
  }
}
