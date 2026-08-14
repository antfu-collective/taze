import type { CommonOptions, NodeVersionMeta, PackageMeta } from '../../types'
import type { Manifest } from '../types'
import { readFile, writeFile } from 'node:fs/promises'
import process from 'node:process'
import { resolve } from 'pathe'
import { glob } from 'tinyglobby'
import { DEFAULT_IGNORE_PATHS } from '../../constants'

// The first line that is *only* a version reference. Comment lines (`# ...`),
// blank lines and aliases (`lts/*`) never match, so they're skipped and left
// untouched; everything around the version token is preserved verbatim.
const NODE_VERSION_RE = /^[ \t]*(v?\d+(?:\.\d+){0,2})[ \t]*\r?$/m

const NODE_VERSION_FILE_RE = /(?:^|\/)(?:\.node-version|\.nvmrc)$/

async function loadNodeVersion(
  relative: string,
  options: CommonOptions,
  shouldUpdate: (name: string) => boolean,
): Promise<NodeVersionMeta[]> {
  const filepath = resolve(options.cwd ?? '', relative)
  const content = await readFile(filepath, 'utf-8')
  const match = NODE_VERSION_RE.exec(content)
  if (!match)
    return []

  const currentVersion = match[1]
  const start = match.index + match[0].indexOf(currentVersion)

  return [{
    name: relative,
    private: false,
    version: currentVersion,
    type: 'node-version',
    relative,
    filepath,
    // slice around the version token so comments/blank lines/newlines survive
    raw: { prefix: content.slice(0, start), suffix: content.slice(start + currentVersion.length) },
    deps: [{
      name: 'node',
      currentVersion,
      source: 'node-version',
      packageType: 'node',
      update: shouldUpdate('node'),
    }],
    resolved: [],
  }]
}

async function writeNodeVersion(pkg: PackageMeta) {
  if (pkg.type !== 'node-version')
    throw new Error('Package type is not supported')

  const node = pkg.resolved.find(dep => dep.source === 'node-version')
  if (node?.update)
    await writeFile(pkg.filepath, `${pkg.raw.prefix}${node.targetVersion}${pkg.raw.suffix}`, 'utf-8')
}

export const nodeVersionManifest: Manifest = {
  name: 'node-version',
  type: 'node-version',
  order: 1,
  enabled: options => options.nodeVersion !== false,
  match: filepath => NODE_VERSION_FILE_RE.test(filepath),
  discover: async (options) => {
    const files = await glob(options.recursive ? ['**/.node-version', '**/.nvmrc'] : ['.node-version', '.nvmrc'], {
      cwd: resolve(options.cwd || process.cwd()),
      ignore: DEFAULT_IGNORE_PATHS.concat(options.ignorePaths || []),
      onlyFiles: true,
      dot: true,
      expandDirectories: false,
    })
    return [...new Set(files)].sort((a, b) => a.localeCompare(b))
  },
  load: loadNodeVersion,
  write: writeNodeVersion,
}
