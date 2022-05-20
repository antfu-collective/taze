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
  const initial = [name]

  initial.push(c.gray(DependenciesTypeShortMap[source]))
  initial.push(timeDifference(currentVersionTime))
  initial.push(c.gray(currentVersion))
  initial.push(c.gray('→'))
  initial.push(colorizeVersionDiff(currentVersion, targetVersion))
  initial.push(timeDifference(targetVersionTime))
  initial.push(latestVersionAvailable ? c.magenta(`  (${latestVersionAvailable} available)`) : '')

  return initial
}
