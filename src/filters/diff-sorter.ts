import { DiffMap } from '../utils/diff'
import { ResolvedDependencies } from '../types'

/**
 * Sort based on the version diff (marjor, minor, etc.)
 */
export function diffSorter(deps: ResolvedDependencies[]) {
  return deps.sort((a, b) => DiffMap[a.diff || ''] - DiffMap[b.diff || ''])
}
