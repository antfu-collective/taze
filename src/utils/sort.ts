import type { ResolvedDepChange } from '../types'
import { toDate } from './time'

export type SortKey = 'time' | 'diff'
export type SortOrder = 'asc' | 'desc'

export type SortOption = `${SortKey}-${SortOrder}`

export function parseSortOption(option: SortOption) {
  return option.split('-') as [SortKey, SortOrder]
}

export function sortDepChanges(changes: ResolvedDepChange[], sortKey: SortKey, descending: boolean): ResolvedDepChange[] {
  return changes.concat().sort((a, b) => {
    if (sortKey === 'time') {
      if (a.targetVersionTime && b.targetVersionTime) {
        const at = toDate(a.targetVersionTime)
        const bt = toDate(b.targetVersionTime)
        return descending ? bt - at : at - bt
      }

      return -1
    }
    else {
      if (a.currentVersionTime && b.currentVersionTime && a.targetVersionTime && b.targetVersionTime) {
        const at = toDate(a.targetVersionTime) - toDate(a.currentVersionTime)
        const bt = toDate(b.targetVersionTime) - toDate(b.currentVersionTime)
        return descending ? bt - at : at - bt
      }

      return -1
    }
  })
}
