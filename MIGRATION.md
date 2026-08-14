# Migration guide: v20 → v21

v21 is an internal architecture refactor. taze now models dependency handling as
two orthogonal axes, each behind an interface:

- **Manifests** (`src/manifests/*`) — _file sources_: how a file that declares
  dependencies is discovered, read and written (package.json, package.yaml,
  pnpm/bun/yarn catalogs, GitHub workflow files).
- **Registries** (`src/registries/*`) — _package types_: how a dependency's
  versions are fetched and resolved for a given ecosystem (`npm`,
  `github-actions`, `jsr`).

**The CLI behaves exactly as before** — no flags, config, or output changed. The
breaking changes are limited to the programmatic API and the source layout.

## Do I need to do anything?

- **CLI users** — no. Upgrade and carry on.
- **`taze` config users** (`taze.config.ts`, `.tazerc`) — no. Config is unchanged.
- **Programmatic users** importing from `'taze'` — almost certainly no. Every
  documented export keeps its name and signature (see below).
- **Forks / `patch-package` / deep source imports** — yes. The `src/io/*` layer
  was removed and split into `src/manifests/*` and `src/registries/*`. See
  [Source layout](#source-layout).

## Public API

All previously exported members are still exported from `'taze'` with the same
names and signatures:

```ts
import {
  CheckPackages,
  defineConfig,
  dumpDependencies,
  loadPackage,
  loadPackages,
  parseDependencies,
  resolveDependencies,
  resolveDependency,
  resolvePackage,
  writePackage,
} from 'taze'
```

Internally, `loadPackage` / `loadPackages` / `writePackage` /
`parseDependencies` / `dumpDependencies` now come from the manifests axis, and
`resolveDependency` / `resolveDependencies` / `resolvePackage` from the
registries axis — but the import path (`'taze'`) and the names are unchanged.

### New exports

```ts
import type { Manifest, PackageType, Registry } from 'taze'
```

- `PackageType` — `'npm' | 'github-actions' | 'jsr'`, the ecosystem/resolution axis.
- `Manifest` — the file-source interface.
- `Registry` — the package-type interface.

## `RawDep` gains `packageType`

`RawDep` has a new **optional** field, `packageType`, that selects which registry
resolves the dependency:

```ts
interface RawDep {
  source: DepType // unchanged — WHERE the dep lives in its manifest
  packageType?: PackageType // NEW — WHICH ecosystem resolves it (defaults to 'npm')
  // …
}
```

- `source` is unchanged and still drives grouping/labelling and catalog identity.
- `packageType` is optional and defaults to `'npm'` when omitted, so existing
  code that constructs `RawDep` objects keeps working. GitHub Actions
  dependencies now carry `packageType: 'github-actions'`, and `jsr:` specifiers
  carry `packageType: 'jsr'`.

If you previously distinguished GitHub Actions via `source === 'github-actions'`,
that still works; `packageType === 'github-actions'` is the new, preferred check.

## Custom manifests

You can now register your own file sources by passing `manifests` to
`CheckPackages` or your `taze.config.ts`. Custom manifests are merged ahead of
the built-ins, so they can add new file types or override how an existing one is
handled. Provide a `discover` hook if the file should be found during a normal
run.

```ts
import type { Manifest } from 'taze'
// taze.config.ts
import { defineConfig } from 'taze'

const myManifest: Manifest = {
  name: 'my-manifest',
  type: 'my-manifest',
  order: 1,
  match: filepath => filepath.endsWith('my-deps.json'),
  discover: async () => ['my-deps.json'],
  async load(relative, options, shouldUpdate) {
    /* return PackageMeta[] */
    return []
  },
  async write(pkg, options) {
    /* persist pkg.resolved */
  },
}

export default defineConfig({
  manifests: [myManifest],
})
```

`manifests` is only available programmatically or from a JS/TS config file, not
from `.tazerc.json`. The built-in list is exported as `builtinManifests`, and
`getManifests(options)` returns the effective merged list.

## The two interfaces

Both `Manifest` and `Registry` are exported as types. Custom manifests are
supported (above); custom registries (new ecosystems) remain internal for now,
but the `Registry` interface is public so you can type against it.

```ts
interface Manifest {
  name: string
  type: PackageMeta['type'] | PackageMeta['type'][]
  match: (filepath: string) => boolean // receives the absolute path
  load: (relative, options, shouldUpdate, raw?) => Promise<PackageMeta[]>
  write: (pkg, options) => Promise<void>
  enabled?: (options) => boolean
  discover?: (options) => Promise<string[]>
  order?: number
}

interface Registry {
  name: PackageType
  resolve: (raw, options, filter?) => Promise<ResolvedDepChange>
  getDiff: (current, target) => DiffType
}
```

## Source layout

If you deep-imported taze's source or patched it, the `src/io/*` modules were
removed. Mapping:

| v20 (`src/io/…`)     | v21                                                                       |
| -------------------- | ------------------------------------------------------------------------- |
| `dependencies.ts`    | `manifests/dependencies.ts`                                               |
| `packages.ts`        | `manifests/index.ts`                                                      |
| `packageJson.ts`     | `manifests/package-json/manifest.ts`                                      |
| `packageYaml.ts`     | `manifests/package-yaml/manifest.ts`                                      |
| `pnpmWorkspaces.ts`  | `manifests/pnpm-workspace/manifest.ts`                                    |
| `bunWorkspaces.ts`   | `manifests/bun-workspace/manifest.ts`                                     |
| `yarnWorkspaces.ts`  | `manifests/yarn-workspace/manifest.ts`                                    |
| `githubActions.ts`   | file IO → `manifests/github-action/manifest.ts`; resolution → `registries/github-actions/registry.ts` |
| `resolves.ts`        | npm resolution → `registries/npm/registry.ts`; GitHub Actions → `registries/github-actions/registry.ts`; caching → `registries/cache.ts`; shared helpers → `registries/shared.ts`; orchestration → `registries/index.ts` |

Each manifest/registry folder exposes only its `Manifest` / `Registry` object
from its `index.ts`; the load/write/resolve helpers are module-private. Import
the high-level API from `'taze'` instead.

## Behaviour

There is no behavioural change: the same files are discovered in the same order,
the same versions are resolved, and the same bytes are written. This is a
structural refactor only.
