import chalk from 'chalk'
import { UsageOptions, PackageMeta } from '../types'
import { TableLogger, createMultiProgresBar, colorizeDiff, wrapJoin, visualPadStart } from '../log'
import { loadPackages } from '../io/packages'
import { getLatestVersions } from '../io/resolves'

export async function usage(options: UsageOptions) {
  const packages = await loadPackages(options)
  const names: Record<string, Record<string, PackageMeta[]>> = {}

  for (const pkg of packages) {
    for (const dep of pkg.deps) {
      if (!names[dep.name])
        names[dep.name] = {}
      if (!names[dep.name][dep.currentVersion])
        names[dep.name][dep.currentVersion] = []

      names[dep.name][dep.currentVersion].push(pkg)
    }
  }

  const usages = Object.entries(names)
    // only check deps with more then 1 version in use
    .filter(i => Object.keys(i[1]).length > 1)
    // sort by the number of versions
    .sort((a, b) => Object.keys(b[1]).length - Object.keys(a[1]).length)

  const bars = createMultiProgresBar()

  // progress bar
  console.log()
  const depBar = bars.create(usages.length, 0, { type: chalk.green('deps') })
  const resolveUsages = await Promise.all(usages.map(async([name, versionMap]) => {
    const { tags } = await getLatestVersions(name)
    depBar.increment(1, { name })
    return [name, versionMap, tags.latest || ''] as const
  }))
  bars.stop()

  // print usage table
  const logger = new TableLogger({
    columns: 5,
    align: 'LRRRR',
  })

  for (const [name, versionMap, latest] of resolveUsages) {
    const versions = Object.keys(versionMap).sort()
    const packagesCount = Object.values(versionMap).flatMap(i => i).length

    if (versions.length > 1) {
      const color = versions.length >= 5
        ? 'magenta'
        : versions.length >= 3
          ? 'red'
          : 'yellow'

      if (options.detail) {
        logger.log()
        logger.row(
          `${chalk.green(name)} ${chalk.gray(`· ${versions.length} versions · latest: ${chalk.blue(latest)}`)}`,
        )
        const pad = Math.max(8, ...Object.keys(versionMap).map(i => i.length)) + 2

        for (const [version, pkgs] of Object.entries(versionMap)) {
          const lines = wrapJoin(pkgs.map(p => p.name), chalk.gray(', '), 80)
          lines.forEach((line, i) => {
            if (i === 0)
              logger.log(`${visualPadStart(chalk.gray(colorizeDiff(latest || version, version, false)), pad, ' ')}  ${line}`)
            else
              logger.log(`${' '.padStart(pad, ' ')}  ${line}`)
          })
        }
      }
      else {
        logger.row(
          chalk.green(name),
          chalk.gray(`${chalk.cyan(packagesCount.toString())} in use / ${chalk[color](versions.length.toString())} versions`),
          versions.map(v => chalk.gray(colorizeDiff(latest || v, v, false))).join(chalk.gray(', ')),
          chalk.gray('→'),
          latest,
        )
      }
    }
  }

  logger.log()
  logger.output()
}
