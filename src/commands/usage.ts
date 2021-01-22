import chalk from 'chalk'
import { SingleBar } from 'cli-progress'
import { UsageOptions } from '../types'
import { TableLogger, createMultiProgresBar, colorizeVersionDiff, wrapJoin, visualPadStart } from '../log'
import { CheckUsages } from '../api/usage'

export async function usage(options: UsageOptions) {
  const bars = createMultiProgresBar()

  // progress bar
  console.log()

  // print usage table
  const logger = new TableLogger({
    columns: 5,
    align: 'LRRRR',
  })

  let depBar: SingleBar | undefined

  const resolveUsages = await CheckUsages(options, {
    onLoaded(usages) {
      depBar = bars.create(usages.length, 0, { type: chalk.green('deps') })
    },
    onDependencyResolved(_, name) {
      depBar?.increment(1, { name })
    },
  })

  bars.stop()

  for (const { name, versionMap, latest } of resolveUsages) {
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
              logger.log(`${visualPadStart(chalk.gray(colorizeVersionDiff(latest || version, version, false)), pad, ' ')}  ${line}`)
            else
              logger.log(`${' '.padStart(pad, ' ')}  ${line}`)
          })
        }
      }
      else {
        logger.row(
          chalk.green(name),
          chalk.gray(`${chalk.cyan(packagesCount.toString())} in use / ${chalk[color](versions.length.toString())} versions`),
          versions.map(v => chalk.gray(colorizeVersionDiff(latest || v, v, false))).join(chalk.gray(', ')),
          chalk.gray('→'),
          latest,
        )
      }
    }
  }

  logger.log()
  logger.output()
}
