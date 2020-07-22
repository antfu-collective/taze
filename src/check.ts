import path from 'path'
import chalk from 'chalk'
import fg from 'fast-glob'
import { loadDependencies, DependenciesTypeShortMap, ResolvedDependencies, writeDependencies } from './in/load-dependencies'
import { checkUpdates } from './in/check-updates'
import { colorizeDiff, TableLogger } from './log'
import { diffSorter } from './filters/diff-sorter'
import { Modes } from './modes'

interface CheckOptions {
  cwd: string
  recursive: boolean
  mode: Modes
  write: boolean
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
      cwd: options.cwd,
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

  logger.log()

  for (const file of packages)
    await checkSinglePackage(file, options, logger)

  logger.output()
}

export async function checkSinglePackage(relative: string, options: CheckOptions, logger: TableLogger) {
  const filepath = path.resolve(options.cwd, relative)
  const { pkg, deps } = await loadDependencies(filepath)

  const resolved = await checkUpdates(deps, options.mode)
  diffSorter(resolved)

  const changes = resolved.filter(i => i.update)
  logPackagesChanges(pkg, changes, relative, logger)

  if (options.write && changes.length) {
    await writeDependencies(filepath, resolved)

    logger.log(chalk.yellow('changes wrote to package.json'))
    logger.log()
  }
}

export function logPackagesChanges(pkg: any, deps: ResolvedDependencies[], filepath: string, logger: TableLogger) {
  logger.log(`${chalk.cyan(pkg.name)} ${chalk.gray(filepath)}`)
  logger.log()

  deps.forEach(({ name, currentVersion, latestVersion, source }) =>
    logger.row(
      `  ${name}`,
      chalk.gray(DependenciesTypeShortMap[source]),
      chalk.gray(currentVersion),
      chalk.gray('→'),
      colorizeDiff(currentVersion, latestVersion),
    ),
  )

  if (!deps.length)
    logger.log(chalk.gray('  ✓ up to date'))

  logger.log()
}
