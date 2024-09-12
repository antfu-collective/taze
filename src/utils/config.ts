import { filterToRegex } from './dependenciesFilter'
import type { CheckOptions } from '../types'

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
