import { ResolvedDependencies } from '../in/load-dependencies'

export function changedFilter(deps: ResolvedDependencies[]) {
  return deps.filter(dep => dep.diff !== null)
}
