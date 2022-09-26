import c from 'picocolors'

const msPerMinute = 60 * 1000
const msPerHour = msPerMinute * 60
const msPerDay = msPerHour * 24
const msPerMonth = msPerDay * 30
const msPerYear = msPerDay * 365

export function toDate(date: string): number {
  return +new Date(date)
}

export function timeDifference(from?: number | string, to = +new Date()) {
  if (!from)
    return ''

  if (typeof from === 'string')
    from = toDate(from)

  const elapsed = to - from

  if (elapsed < msPerDay)
    return c.gray('⩽1d')

  else if (elapsed < msPerMonth)
    return c.green(`~${Math.round(elapsed / msPerDay)}d`)

  else if (elapsed < msPerYear)
    return c.yellow(`~${Math.round(elapsed / msPerMonth)}mo`)

  else
    return c.red(`~${+(elapsed / msPerYear).toFixed(1)}y`)
}
