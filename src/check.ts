import path from 'path'
import chalk from 'chalk'
import fg from 'fast-glob'
import { loadDependencies, DependenciesTypeShortMap, ResolvedDependencies } from './in/load-dependencies'
import { checkUpdates } from './in/check-updates'
import { columnLog, colorizeDiff } from './log'
import { changedFilter } from './filters/version-filter'
import { diffSorter } from './filters/diff-sorter'

interface CheckOptions {
  path: string
  recursive: boolean
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

  for (const file of packages)
    await checkSinglePackage(file, options)
}

export async function checkSinglePackage(relative: string, options: CheckOptions) {
  const { pkg, deps } = await loadDependencies(path.resolve(options.path, relative))

  const resolved = await checkUpdates(deps)
  const filtered = changedFilter(resolved)
  diffSorter(filtered)

  logPackagesChanges(pkg, filtered, relative)
}

export async function logPackagesChanges(pkg: any, deps: ResolvedDependencies[], filepath: string) {
  console.log(`${chalk.cyan(pkg.name)} ${chalk.gray(filepath)}`)
  console.log()
  await columnLog(
    5,
    (log) => {
      deps.forEach(({ name, currentVersion, latestVersion = '', source }) =>
        log(
          `  ${name}`,
          chalk.gray(DependenciesTypeShortMap[source]),
          chalk.gray(currentVersion),
          chalk.gray('→'),
          colorizeDiff(currentVersion, `^${latestVersion}`),
        ),
      )
    },
    {
      pending: 2,
      align: ['left', 'left', 'right', 'right', 'right'],
    },
  )
  console.log()
}
