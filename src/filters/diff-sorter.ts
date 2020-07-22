import { ResolvedDependencies } from '../in/load-dependencies'

const diffMap = {
  major: 0,
  premajor: 1,
  minor: 2,
  preminor: 3,
  patch: 4,
  prepatch: 5,
  prerelease: 6,
  '': 7,
}

export function diffSorter(deps: ResolvedDependencies[]) {
  return deps.sort((a, b) => diffMap[a.diff || ''] - diffMap[b.diff || ''])
}
