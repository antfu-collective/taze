import type { BunWorkspaceMeta, CommonOptions, RawDep } from '../types'
import { resolve } from 'pathe'
import { dumpDependencies, parseDependency } from './dependencies'
import { readJSON, writeJSON } from './packages'

export async function loadBunWorkspace(
  relative: string,
  options: CommonOptions,
  shouldUpdate: (name: string) => boolean,
): Promise<BunWorkspaceMeta[]> {
  const filepath = resolve(options.cwd ?? '', relative)
  const raw = await readJSON(filepath)

  const catalogs: BunWorkspaceMeta[] = []

  function createBunWorkspaceEntry(name: string, map: Record<string, string>): BunWorkspaceMeta {
    const deps: RawDep[] = Object.entries(map)
      .map(([pkg, version]) => parseDependency(pkg, version, 'bun-workspace', shouldUpdate))

    return {
      name,
      private: true,
      version: '',
      type: 'bun-workspace',
      relative,
      filepath,
      raw,
      deps,
      resolved: [],
    } satisfies BunWorkspaceMeta
  }

  // Handle bun catalog structure from root package.json
  if (raw?.workspaces?.catalog) {
    catalogs.push(
      createBunWorkspaceEntry('bun-catalog:default', raw.workspaces.catalog),
    )
  }

  if (raw?.workspaces?.catalogs) {
    for (const key of Object.keys(raw.workspaces.catalogs)) {
      catalogs.push(
        createBunWorkspaceEntry(`bun-catalog:${key}`, raw.workspaces.catalogs[key]),
      )
    }
  }

  return catalogs
}

export async function writeBunWorkspace(
  pkg: BunWorkspaceMeta,
  _options: CommonOptions,
) {
  const versions = dumpDependencies(pkg.resolved, 'bun-workspace')

  if (!Object.keys(versions).length)
    return

  if (pkg.name.startsWith('bun-catalog:')) {
    const catalogName = pkg.name.replace('bun-catalog:', '')

    // Update the catalog in the raw object
    if (catalogName === 'default') {
      if (!pkg.raw.workspaces)
        pkg.raw.workspaces = {}
      if (!pkg.raw.workspaces.catalog)
        pkg.raw.workspaces.catalog = {}
      Object.assign(pkg.raw.workspaces.catalog, versions)
    }
    else {
      if (!pkg.raw.workspaces)
        pkg.raw.workspaces = {}
      if (!pkg.raw.workspaces.catalogs)
        pkg.raw.workspaces.catalogs = {}
      if (!pkg.raw.workspaces.catalogs[catalogName])
        pkg.raw.workspaces.catalogs[catalogName] = {}
      Object.assign(pkg.raw.workspaces.catalogs[catalogName], versions)
    }

    // Write the updated package.json
    await writeJSON(pkg.filepath, pkg.raw)
  }
}
