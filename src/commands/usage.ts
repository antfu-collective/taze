import c from 'picocolors'
import type { SingleBar } from 'cli-progress'
import type { UsageOptions } from '../types'
import { TableLogger, createMultiProgresBar, wrapJoin } from '../log'
import { CheckUsages } from '../api/usage'
import { colorizeVersionDiff, visualPadStart } from '../render'

export async function usage(options: UsageOptions) {
  const bars = createMultiProgresBar()

  // print usage table
  const logger = new TableLogger({
    columns: 5,
    align: 'LRRRR',
    loglevel: options.loglevel,
  })

  // progress bar
  logger.log()

  let depBar: SingleBar | undefined

  const resolveUsages = await CheckUsages(options, {
    onLoaded(usages) {
      depBar = bars.create(usages.length, 0, { type: c.green('deps') })
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
          `${c.green(name)} ${c.gray(`· ${versions.length} versions · latest: ${c.blue(latest)}`)}`,
        )
        const pad = Math.max(8, ...Object.keys(versionMap).map(i => i.length)) + 2

        for (const [version, pkgs] of Object.entries(versionMap)) {
          const lines = wrapJoin(pkgs.map(p => p.name), c.gray(', '), 80)
          lines.forEach((line, i) => {
            if (i === 0)
              logger.log(`${visualPadStart(c.gray(colorizeVersionDiff(latest || version, version, false)), pad, ' ')}  ${line}`)
            else
              logger.log(`${' '.padStart(pad, ' ')}  ${line}`)
          })
        }
      }
      else {
        logger.row(
          c.green(name),
          c.gray(`${c.cyan(packagesCount.toString())} in use / ${c[color](versions.length.toString())} versions`),
          versions.map(v => c.gray(colorizeVersionDiff(latest || v, v, false))).join(c.gray(', ')),
          c.gray('→'),
          latest,
        )
      }
    }
  }

  logger.log()
  logger.output()
}
