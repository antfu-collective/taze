import type { CheckOptions } from './types'

export { CheckPackages } from './api/check'
export type { Manifest } from './manifests'
export { dumpDependencies, loadPackage, loadPackages, parseDependencies, writePackage } from './manifests'
export type { Registry } from './registries'
export { resolveDependencies, resolveDependency, resolvePackage } from './registries'
export * from './types'

export function defineConfig(config: Partial<CheckOptions>) {
  return config
}
