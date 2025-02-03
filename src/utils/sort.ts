import type { ResolvedDepChange } from '../types'
import { DependenciesTypeShortMap } from '../types'
import { DiffMap } from './diff'
import { toDate } from './time'

export type SortKey = 'time' | 'diff' | 'name'
export type SortOrder = 'asc' | 'desc'

export type SortOption = `${SortKey}-${SortOrder}`
export const SORT_CHOICES = [
  'time-asc',
  'time-desc',
  'diff-asc',
  'diff-desc',
  'name-asc',
  'name-desc',
] as const

export function parseSortOption(option: SortOption) {
  return option.split('-') as [SortKey, SortOrder]
}

export function sortDepChanges(
  changes: readonly ResolvedDepChange[],
  option: SortOption,
  grouped: boolean,
): ResolvedDepChange[] {
  const [sortKey, order = 'asc'] = parseSortOption(option)

  let sorted = changes.concat()
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

  sorted = order === 'desc'
    ? sorted.reverse()
    : sorted

  if (grouped) {
    const order = Object.keys(DependenciesTypeShortMap)
    sorted = sorted.sort((a, b) => {
      const ai = order.indexOf(a.source)
      const bi = order.indexOf(b.source)
      return ai - bi
    })
  }

  return sorted
}
