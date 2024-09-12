import type { CheckOptions } from './types'

export { CheckPackages } from './api/check'
export { dumpDependencies, parseDependencies } from './io/dependencies'
export { loadPackage, loadPackages, writePackage } from './io/packages'
export { resolveDependencies, resolveDependency, resolvePackage } from './io/resolves'
export * from './types'

export function defineConfig(config: Partial<CheckOptions>) {
  return config
}
