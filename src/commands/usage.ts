import chalk from 'chalk'
import { UsageOptions, PackageMeta } from '../types'
import { TableLogger } from '../log'
import { loadPackages } from '../io/packages'

export async function usage(options: UsageOptions) {
  const pkgs = await loadPackages(options)
  const names: Record<string, Record<string, PackageMeta[]>> = {}

  for (const pkg of pkgs) {
    for (const dep of pkg.deps) {
      if (!names[dep.name])
        names[dep.name] = {}
      if (!names[dep.name][dep.currentVersion])
        names[dep.name][dep.currentVersion] = []

      names[dep.name][dep.currentVersion].push(pkg)
    }
  }

  const logger = new TableLogger({
    columns: 4,
    align: 'LRRR',
  })
  logger.log()

  const usages = Object.entries(names)
    .sort((a, b) => Object.keys(b[1]).length - Object.keys(a[1]).length)

  for (const [name, deps] of usages) {
    const versions = Object.keys(deps).sort()
    const packages = Object.values(deps).flatMap(i => i).length

    if (versions.length > 1) {
      const color = versions.length >= 5
        ? 'magenta'
        : versions.length >= 3
          ? 'red'
          : 'yellow'

      logger.row(
        chalk.green(name),
        chalk.gray(`${chalk.cyan(packages.toString())} in use / ${chalk[color](versions.length.toString())} versions`),
        versions.join(chalk.gray(', ')),
      )
    }
  }

  logger.log()
  logger.output()
}
