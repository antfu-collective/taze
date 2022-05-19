import c from 'picocolors'
import { colorizeVersionDiff } from '../log'
import type { ResolvedDependencies } from '../types'
import { DependenciesTypeShortMap } from '../types'
import { timeDifference } from './time'

export function generateStringDependency({
  name,
  currentVersion,
  targetVersion,
  source,
  currentVersionTime,
  targetVersionTime,
  latestVersionAvailable,
}: ResolvedDependencies) {
  let initial = name

  initial += ` ${c.gray(DependenciesTypeShortMap[source])}`
  initial += ` ${timeDifference(currentVersionTime)}`
  initial += ` ${c.gray(currentVersion)}`
  initial += ` ${c.gray('→')}`
  initial += ` ${colorizeVersionDiff(currentVersion, targetVersion)}`
  initial += ` ${timeDifference(targetVersionTime)}`
  initial += latestVersionAvailable ? c.magenta(`  (${latestVersionAvailable} available)`) : ''

  return initial
}
