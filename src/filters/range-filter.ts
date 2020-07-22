import { ResolvedDependencies, DiffType } from '../in/load-dependencies'
import { DiffMap } from '../utils/diff'

export function rangeFilter(deps: ResolvedDependencies[], range: DiffType) {
  const target = DiffMap[range || ''] ?? 1000
  return deps.forEach((dep) => {
    dep.update = dep.update && DiffMap[dep.diff || ''] >= target
  })
}
