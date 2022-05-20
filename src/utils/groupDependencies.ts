import type { ResolvedDependencies } from '../types'
import type { DiffMap } from './diff'

export function groupDependencies(dependencies: ResolvedDependencies[]) {
  return dependencies.reduce((acc, change) => {
    const diff = change.diff || 'error'

    if (acc[diff] === undefined)
      acc[diff] = []

    acc[diff].push(change)

    return acc
  }, {} as Record<Exclude<keyof typeof DiffMap, null>, ResolvedDependencies[]>)
}
