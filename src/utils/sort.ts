import type { ResolvedDepChange } from '../types'
import { DiffMap } from './diff'
import { toDate } from './time'

export type SortKey = 'time' | 'diff' | 'name'
export type SortOrder = 'asc' | 'desc'

export type SortOption = `${SortKey}-${SortOrder}`

export function parseSortOption(option: SortOption) {
  return option.split('-') as [SortKey, SortOrder]
}

export function sortDepChanges(changes: readonly ResolvedDepChange[], option: SortOption): ResolvedDepChange[] {
  const [sortKey, order = 'asc'] = parseSortOption(option)

  const sorted = changes.concat()
    .sort((a, b) => {
      if (sortKey === 'time') {
        if (a.targetVersionTime && b.targetVersionTime) {
          const at = toDate(a.targetVersionTime)
          const bt = toDate(b.targetVersionTime)
          return bt - at
        }
      }
      else if (sortKey === 'name') {
        return a.name.localeCompare(b.name)
      }
      else if (sortKey === 'diff') {
        return DiffMap[a.diff || ''] - DiffMap[b.diff || '']
      }
      return 0
    })

  return order === 'desc'
    ? sorted.reverse()
    : sorted
}
