import path from 'path'
import chalk from 'chalk'
import fg from 'fast-glob'
import { loadDependencies, DependenciesTypeShortMap, ResolvedDependencies, DiffType } from './in/load-dependencies'
import { checkUpdates } from './in/check-updates'
import { colorizeDiff, TableLogger } from './log'
import { diffSorter } from './filters/diff-sorter'
import { rangeFilter } from './filters/range-filter'

interface CheckOptions {
  path: string
  recursive: boolean
  range: string
}

export async function check(options: CheckOptions) {
  let packages: string[] = []

  if (options.recursive) {
    packages = await fg('**/package.json', {
      ignore: [
        '**/node_modules/**',
        '**/dist/**',
        '**/public/**',
      ],
      cwd: options.path,
      onlyFiles: true,
    })
  }
  else {
    packages = ['package.json']
  }

  const logger = new TableLogger({
    columns: 5,
    pending: 2,
    align: 'LLRRR',
  })

  for (const file of packages)
    await checkSinglePackage(file, options, logger)

  logger.output()
}

export async function checkSinglePackage(relative: string, options: CheckOptions, logger: TableLogger) {
  const { pkg, deps } = await loadDependencies(path.resolve(options.path, relative))

  const resolved = await checkUpdates(deps)
  rangeFilter(resolved, options.range as DiffType)
  diffSorter(resolved)

  logPackagesChanges(pkg, resolved.filter(i => i.update), relative, logger)
}

export async function logPackagesChanges(pkg: any, deps: ResolvedDependencies[], filepath: string, logger: TableLogger) {
  logger.logRaw(`${chalk.cyan(pkg.name)} ${chalk.gray(filepath)}`)
  logger.logRaw('')

  deps.forEach(({ name, currentVersion, latestVersion = '', source }) =>
    logger.log(
      `  ${name}`,
      chalk.gray(DependenciesTypeShortMap[source]),
      chalk.gray(currentVersion),
      chalk.gray('→'),
      colorizeDiff(currentVersion, `^${latestVersion}`),
    ),
  )

  if (!deps.length)
    logger.logRaw(chalk.gray('  ✓ up to date'))

  logger.logRaw('')
}
