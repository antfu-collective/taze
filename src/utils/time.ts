import type { ColorsOptions } from '../types'
import { createColors } from './colors'

const msPerMinute = 60 * 1000
const msPerHour = msPerMinute * 60
const msPerDay = msPerHour * 24
const msPerMonth = msPerDay * 30
const msPerYear = msPerDay * 365

export function toDate(date: string): number {
  return +new Date(date)
}

export function timeDifference(from?: number | string, to = Date.now(), colors: ColorsOptions = {}) {
  const c = createColors(colors)
  if (!from)
    return ''

  if (typeof from === 'string')
    from = toDate(from)

  const elapsed = to - from

  if (elapsed < msPerHour)
    return c.releaseAgeUnderHour('<1h')

  else if (elapsed < msPerHour * 100)
    return c.releaseAgeHours`~${Math.round(elapsed / msPerHour)}h`

  else if (elapsed < msPerMonth)
    return c.releaseAgeDays`~${Math.round(elapsed / msPerDay)}d`

  else if (elapsed < msPerYear)
    return c.releaseAgeMonths`~${Math.round(elapsed / msPerMonth)}mo`

  else
    return c.releaseAgeYears`~${+(elapsed / msPerYear).toFixed(1)}y`
}
