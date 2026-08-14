import type { CheckOptions, DependencyFilter, DiffType, PackageType, RawDep, ResolvedDepChange } from '../types'

/**
 * A package registry / ecosystem — the second axis of taze.
 *
 * A registry knows how to fetch version metadata for a given ecosystem and how
 * to resolve a raw dependency into a concrete target version. Registries are
 * selected per dependency via {@link RawDep.packageType}, so a manifest can mix
 * dependencies from several ecosystems and each is routed to the right registry.
 *
 * Implementations live in `src/registries/*` and are collected in
 * `src/registries/index.ts`.
 */
export interface Registry {
  /**
   * Ecosystem id. Matches {@link RawDep.packageType} for routing.
   */
  name: PackageType

  /**
   * Resolve a single raw dependency into a {@link ResolvedDepChange}, fetching
   * whatever metadata the ecosystem needs.
   */
  resolve: (
    raw: RawDep,
    options: CheckOptions,
    filter?: DependencyFilter,
  ) => Promise<ResolvedDepChange>

  /**
   * Compute the diff between the current and target reference. Ecosystems that
   * use non-semver references coerce them here before comparing.
   */
  getDiff: (current: string, target: string) => DiffType
}
