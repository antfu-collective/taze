import path from 'path'
import chalk from 'chalk'
import { loadDependencies } from './in/load-dependencies'
import { checkUpdates } from './in/check-updates'
import { columnLog, colorizeDiff } from './log'

export async function check(argv: any) {
  const filepath = path.resolve('./package.json')
  const { pkg, deps } = await loadDependencies(filepath)
  const name = pkg.name

  await checkUpdates(deps)
  console.log(`${chalk.cyan(name)} ${chalk.gray(filepath)}`)
  console.log()
  await columnLog(4, (log) => {
    deps.forEach(({ name, currentVersion, latestVersion = '' }) => log(`  ${name}`, chalk.gray(currentVersion), chalk.gray('->'), colorizeDiff(currentVersion, `^${latestVersion}`)))
  }, {
    pending: 2,
    align: ['left', 'right', 'right', 'right'],
  })
  console.log()

  //
}
