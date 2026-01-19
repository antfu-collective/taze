import type { BunWorkspaceMeta, CommonOptions, RawDep } from '../types'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'pathe'
import { dumpDependencies, parseDependency } from './dependencies'

export async function loadBunWorkspace(
  relative: string,
  options: CommonOptions,
  shouldUpdate: (name: string) => boolean,
): Promise<BunWorkspaceMeta[]> {
  const filepath = resolve(options.cwd ?? '', relative)
  const rawText = await readFile(filepath, 'utf-8')
  const raw = JSON.parse(rawText)

  const catalogs: BunWorkspaceMeta[] = []

  function createBunWorkspaceEntry(name: string, map: Record<string, string>): BunWorkspaceMeta {
    const deps: RawDep[] = Object.entries(map)
      .map(([pkg, version]) => parseDependency({ name: pkg, version, type: 'bun-workspace', shouldUpdate }))

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

  // Handle Bun workspaces structure
  const workspaces = raw?.workspaces

  if (workspaces) {
    // Check if workspaces has catalog (singular)
    if (workspaces.catalog) {
      catalogs.push(
        createBunWorkspaceEntry('bun-catalog:default', workspaces.catalog),
      )
    }

    // Check if workspaces has catalogs (plural)
    if (workspaces.catalogs) {
      for (const key of Object.keys(workspaces.catalogs)) {
        catalogs.push(
          createBunWorkspaceEntry(`bun-catalog:${key}`, workspaces.catalogs[key]),
        )
      }
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

    // Ensure workspaces object exists and cast to proper type
    const workspaces = (pkg.raw.workspaces as Record<string, unknown>) || {}
    pkg.raw.workspaces = workspaces

    if (catalogName === 'default') {
      // Update the default catalog
      const catalog = (workspaces.catalog as Record<string, string>) || {}
      workspaces.catalog = { ...catalog, ...versions }
    }
    else {
      // Update named catalog
      const catalogs = (workspaces.catalogs as Record<string, Record<string, string>>) || {}
      workspaces.catalogs = catalogs
      if (!catalogs[catalogName]) {
        catalogs[catalogName] = {}
      }
      catalogs[catalogName] = { ...catalogs[catalogName], ...versions }
    }

    await writeJSON(pkg, pkg.raw)
  }
}

async function writeJSON(pkg: BunWorkspaceMeta, data: Record<string, unknown>) {
  const content = JSON.stringify(data, null, 2)
  return writeFile(pkg.filepath, `${content}\n`, 'utf8')
}
