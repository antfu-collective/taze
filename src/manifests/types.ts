import type { CommonOptions, PackageMeta } from '../types'

/**
 * A manifest / file source — the first axis of taze.
 *
 * A manifest knows how to discover, read and write a particular kind of file
 * that declares dependencies (package.json, package.yaml, pnpm-workspace.yaml,
 * GitHub workflow files, …). Each dependency it emits is tagged with a
 * {@link PackageType} so the registry axis (`src/registries/*`) can resolve it.
 *
 * Implementations live in `src/manifests/*` and are collected in
 * `src/manifests/index.ts`.
 */
export interface Manifest {
  /**
   * Human-readable id, mostly for debugging.
   */
  name: string

  /**
   * The {@link PackageMeta} `type`(s) this manifest produces. Used to route
   * writes back to the manifest that owns a loaded package.
   */
  type: PackageMeta['type'] | PackageMeta['type'][]

  /**
   * Whether a discovered relative path belongs to this manifest, used to route
   * loads. Manifests that are only reached indirectly (e.g. bun catalogs, which
   * are emitted while loading a package.json) return `false`.
   */
  match: (relative: string) => boolean

  /**
   * Parse a file into one or more {@link PackageMeta}. `raw` may be provided to
   * reuse an already-read file (e.g. to avoid double reads for package.json).
   */
  load: (
    relative: string,
    options: CommonOptions,
    shouldUpdate: (name: string) => boolean,
    raw?: Record<string, unknown>,
  ) => Promise<PackageMeta[]>

  /**
   * Write resolved changes back to disk.
   */
  write: (pkg: PackageMeta, options: CommonOptions) => Promise<void>

  /**
   * Whether this manifest is active for the given options (e.g. GitHub Actions
   * checking can be disabled). Defaults to always enabled.
   */
  enabled?: (options: CommonOptions) => boolean

  /**
   * Self-discover the relative paths this manifest owns, using whatever glob /
   * existence checks the file kind needs. Manifests handled by the shared
   * package-file discovery (package.json / package.yaml) omit this.
   */
  discover?: (options: CommonOptions) => Promise<string[]>

  /**
   * Load ordering relative to other manifests (lower loads first). Package files
   * are `0`; workspace catalog files load before them, GitHub Actions after.
   */
  order?: number
}
