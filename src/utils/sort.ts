import type { ResolvedDepChange } from '../types'
import { toDate } from './time'

export function sortDepChanges(changes: ResolvedDepChange[], reversed: boolean): ResolvedDepChange[] {
  return changes.concat().sort((a, b) => {
    if (a.targetVersionTime && b.targetVersionTime) {
      const at = toDate(a.targetVersionTime)
      const bt = toDate(b.targetVersionTime)
      return reversed ? bt - at : at - bt
    }

    return 0
  })
}
