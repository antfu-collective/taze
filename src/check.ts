import chalk from 'chalk'
import { loadDependencies } from './in/load-dependencies'
import { checkUpdates } from './in/check-updates'
import { columnLog } from './log'

export async function check(argv: any) {
  const { pkg, deps } = await loadDependencies('./package.json')
  const name = pkg.name

  await checkUpdates(deps)
  console.log(chalk.cyan(name))
  console.log()
  await columnLog(3, (log) => {
    deps.forEach(({ name, currentVersion, latestVersion = '' }) => log(name, colorizeDiff(currentVersion, latestVersion), latestVersion))
  })
  console.log()

  //
}

function colorizeDiff(from: string, to: string) {
  let leadingWildcard = ''

  // separate out leading ^ or ~
  if (/^[~^]/.test(to) && to[0] === from[0]) {
    leadingWildcard = to[0]
    to = to.slice(1)
    from = from.slice(1)
  }

  // split into parts
  const partsToColor = to.split('.')
  const partsToCompare = from.split('.')

  let i = partsToColor.findIndex((part, i) => part !== partsToCompare[i])
  i = i >= 0 ? i : partsToColor.length

  // major = red (or any change before 1.0.0)
  // minor = cyan
  // patch = green
  const color = i === 0 || partsToColor[0] === '0' ? 'red'
    : i === 1 ? 'cyan'
      : 'green'

  // if we are colorizing only part of the word, add a dot in the middle
  const middot = i > 0 && i < partsToColor.length ? '.' : ''

  return leadingWildcard
        + partsToColor.slice(0, i).join('.')
        + middot
        + chalk[color](partsToColor.slice(i).join('.'))
}
