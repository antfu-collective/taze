import { DiffMap } from '../utils/diff'
import type { ResolvedDepChange } from '../types'

/**
 * Sort based on the version diff (marjor, minor, etc.)
 */
export function diffSorter(deps: ResolvedDepChange[]) {
  return deps.sort((a, b) => DiffMap[a.diff || ''] - DiffMap[b.diff || ''])
}
