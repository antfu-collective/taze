import type { CheckOptions } from '../types'
import { filterToRegex } from './dependenciesFilter'

export function getPackageMode(pkgName: string, options: CheckOptions) {
  if (!options.packageMode)
    return undefined

  for (const name of Object.keys(options.packageMode)) {
    const regex = filterToRegex(name)
    if (regex.test(pkgName))
      return options.packageMode[name]
  }
  return undefined
}
