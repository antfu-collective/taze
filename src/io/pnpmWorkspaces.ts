import type { CommonOptions, PackageMeta, RawDep } from '../types'
import fs from 'node:fs/promises'
import path from 'node:path'
import YAML from 'js-yaml'
import { dumpDependencies, parseDependency } from './dependencies'

export async function loadPnpmWorkspace(
  relative: string,
  options: CommonOptions,
  shouldUpdate: (name: string) => boolean,
): Promise<PackageMeta[]> {
  const filepath = path.resolve(options.cwd ?? '', relative)
  const rawText = await fs.readFile(filepath, 'utf-8')
  const raw = YAML.load(rawText) as any || {}

  const catalogs: PackageMeta[] = []

  function createCatalogFromKeyValue(catalogName: string, map: Record<string, string>): PackageMeta {
    const deps: RawDep[] = Object.entries(map)
      .map(([name, version]) => parseDependency(name, version, 'pnpm:catalog', shouldUpdate))

    return {
      name: `catalog:${catalogName}`,
      private: true,
      version: '',
      type: 'pnpm-workspace.yaml',
      relative,
      filepath,
      raw,
      deps,
      resolved: [],
    }
  }

  if (raw.catalog) {
    catalogs.push(
      createCatalogFromKeyValue('default', raw.catalog),
    )
  }

  if (raw.catalogs) {
    for (const key of Object.keys(raw.catalogs)) {
      catalogs.push(
        createCatalogFromKeyValue(key, raw.catalogs[key]),
      )
    }
  }

  return catalogs
}

export async function writePnpmWorkspace(
  pkg: PackageMeta,
  _options: CommonOptions,
) {
  const catalogName = pkg.name.replace('catalog:', '')
  const versions = dumpDependencies(pkg.resolved, 'pnpm:catalog')

  if (!Object.keys(versions).length)
    return

  let changed = false

  if (catalogName === 'default') {
    if (JSON.stringify(pkg.raw.catalog) !== JSON.stringify(versions)) {
      pkg.raw.catalog = versions
      changed = true
    }
  }
  else {
    pkg.raw.catalogs ??= {}
    if (pkg.raw.catalogs[catalogName] !== versions) {
      pkg.raw.catalogs[catalogName] = versions
      changed = true
    }
  }

  if (changed)
    await fs.writeFile(pkg.filepath, YAML.dump(pkg.raw), 'utf-8')
}
