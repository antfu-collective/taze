import type { Scalar } from 'yaml'
import type { CommonOptions, PnpmWorkspaceMeta, RawDep } from '../types'
import fs from 'node:fs/promises'
import path from 'node:path'
import _debug from 'debug'
import { isAlias, parse, parseDocument, YAMLMap } from 'yaml'
import { findAnchor, writeYaml } from '../utils/yaml'
import { dumpDependencies, parseDependency } from './dependencies'

const debug = _debug('taze:io:pnpmWorkspace')

export async function loadPnpmWorkspace(
  relative: string,
  options: CommonOptions,
  shouldUpdate: (name: string) => boolean,
): Promise<PnpmWorkspaceMeta[]> {
  const filepath = path.resolve(options.cwd ?? '', relative)
  const rawText = await fs.readFile(filepath, 'utf-8')
  const raw = parse(rawText)
  const document = parseDocument(rawText)

  const catalogs: PnpmWorkspaceMeta[] = []

  function createCatalogFromKeyValue(catalogName: string, map: Record<string, string>): PnpmWorkspaceMeta {
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
      document,
    } satisfies PnpmWorkspaceMeta
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
  pkg: PnpmWorkspaceMeta,
  _options: CommonOptions,
) {
  const versions = dumpDependencies(pkg.resolved, 'pnpm:catalog')

  if (!Object.keys(versions).length)
    return

  const catalogName = pkg.name.replace('catalog:', '')
  const document = pkg.document.clone()
  let changed = false

  if (catalogName === 'default') {
    if (!document.has('catalog')) {
      document.set('catalog', new YAMLMap())
    }
    const catalog = document.get('catalog') as YAMLMap<Scalar.Parsed, Scalar.Parsed>
    updateCatalog(catalog)
  }
  else {
    if (!document.has('catalogs')) {
      document.set('catalogs', new YAMLMap())
    }
    const catalog = (document.get('catalogs') as YAMLMap).get(catalogName) as YAMLMap<Scalar.Parsed, Scalar.Parsed>
    updateCatalog(catalog)
  }

  if (changed)
    await writeYaml(pkg, document)

  // currently only support preserve yaml anchor and alias with single string value
  function updateCatalog(catalog: YAMLMap<Scalar.Parsed, Scalar.Parsed>) {
    for (const [key, targetVersion] of Object.entries(versions)) {
      const pair = catalog.items.find(i => i.key.value === key)
      if (!pair?.value || !pair.key) {
        debug(`Exception encountered while parsing pnpm-workspace.yaml, key: ${key}`)
        continue
      }

      if (isAlias(pair?.value)) {
        const anchor = findAnchor(document, pair.value)
        if (!anchor) {
          debug(`can't find anchor for alias: ${pair.value} in pnpm-workspace.yaml`)
          continue
        }
        else if (anchor.value !== targetVersion) {
          anchor.value = targetVersion
          changed = true
        }
      }
      else if (pair.value.value !== targetVersion) {
        pair.value.value = targetVersion
        changed = true
      }
    }
  }
}
