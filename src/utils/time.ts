import chalk from 'chalk'

const msPerMinute = 60 * 1000
const msPerHour = msPerMinute * 60
const msPerDay = msPerHour * 24
const msPerMonth = msPerDay * 30
const msPerYear = msPerDay * 365

export function timeDifference(from?: number | string, to = +new Date()) {
  if (!from)
    return ''

  if (typeof from === 'string')
    from = +new Date(from)

  const elapsed = to - from

  if (elapsed < msPerDay)
    return chalk.gray('⩽1d')

  else if (elapsed < msPerMonth)
    return chalk.green(`~${Math.round(elapsed / msPerDay)}d`)

  else if (elapsed < msPerYear)
    return chalk.yellow(`~${Math.round(elapsed / msPerMonth)}mo`)

  else
    return chalk.red(`~${+(elapsed / msPerYear).toFixed(1)}y`)
}
