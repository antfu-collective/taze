import { ResolvedDependencies } from '../in/load-dependencies'
import { DiffMap } from '../utils/diff'

export function diffSorter(deps: ResolvedDependencies[]) {
  return deps.sort((a, b) => DiffMap[a.diff || ''] - DiffMap[b.diff || ''])
}
