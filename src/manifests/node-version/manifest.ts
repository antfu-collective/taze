import type { CommonOptions, NodeVersionMeta, PackageMeta, RawDep } from '../../types'
import type { Manifest } from '../types'
import { readFile, writeFile } from 'node:fs/promises'
import process from 'node:process'
import { resolve } from 'pathe'
import { glob } from 'tinyglobby'
import { DEFAULT_IGNORE_PATHS } from '../../constants'
import { parseVersionReference } from '../../utils/versionReference'

// A line that is *only* a version reference (plus surrounding whitespace).
// Comment lines (`# ...`), blank lines and alias lines (`lts/*`, `node`) never
// match, so they are preserved untouched and the file is skipped if it holds no
// usable version.
const NODE_VERSION_LINE_RE = /^(\s*)(v?\d+(?:\.\d+){0,2})(\s*)$/

const NODE_VERSION_FILE_RE = /(?:^|\/)(?:\.node-version|\.nvmrc)$/

function isNodeVersionEnabled(options: CommonOptions): boolean {
  return options.nodeVersion !== false
}

function isNodeVersionPath(filepath: string): boolean {
  return NODE_VERSION_FILE_RE.test(filepath)
}

async function discoverNodeVersionFiles(options: CommonOptions): Promise<string[]> {
  const ignore = DEFAULT_IGNORE_PATHS.concat(options.ignorePaths || [])
  const patterns = options.recursive
    ? ['**/.node-version', '**/.nvmrc']
    : ['.node-version', '.nvmrc']

  const files = await glob(patterns, {
    cwd: resolve(options.cwd || process.cwd()),
    ignore,
    onlyFiles: true,
    dot: true,
    expandDirectories: false,
  })

  return [...new Set(files)].sort((a, b) => a.localeCompare(b))
}

async function loadNodeVersion(
  relative: string,
  options: CommonOptions,
  shouldUpdate: (name: string) => boolean,
): Promise<NodeVersionMeta[]> {
  const filepath = resolve(options.cwd ?? '', relative)
  const content = await readFile(filepath, 'utf-8')

  // Keep line endings intact by splitting on `\n` only; any trailing `\r` is
  // captured as part of the version line's trailing whitespace group.
  const lines = content.split('\n')

  let versionLineIndex = -1
  let leading = ''
  let trailing = ''
  let currentVersion = ''

  for (let i = 0; i < lines.length; i++) {
    const match = NODE_VERSION_LINE_RE.exec(lines[i])
    if (!match)
      continue
    const parsed = parseVersionReference(match[2])
    if (!parsed || parsed.prerelease)
      continue
    versionLineIndex = i
    leading = match[1]
    currentVersion = match[2]
    trailing = match[3]
    break
  }

  if (versionLineIndex === -1)
    return []

  return [{
    name: relative,
    private: false,
    version: currentVersion,
    type: 'node-version',
    relative,
    filepath,
    raw: {
      lines,
      versionLineIndex,
      leading,
      trailing,
    },
    deps: [{
      name: 'node',
      currentVersion,
      source: 'node-version',
      packageType: 'node',
      update: shouldUpdate('node'),
    } satisfies RawDep],
    resolved: [],
  }]
}

async function writeNodeVersion(pkg: PackageMeta, _options: CommonOptions) {
  if (pkg.type !== 'node-version')
    throw new Error('Package type is not supported')

  const node = pkg.resolved.find(dep => dep.source === 'node-version')
  if (!node?.update)
    return

  const { lines, versionLineIndex, leading, trailing } = pkg.raw
  const next = [...lines]
  next[versionLineIndex] = `${leading}${node.targetVersion}${trailing}`

  await writeFile(pkg.filepath, next.join('\n'), 'utf-8')
}

export const nodeVersionManifest: Manifest = {
  name: 'node-version',
  type: 'node-version',
  order: 1,
  enabled: isNodeVersionEnabled,
  match: isNodeVersionPath,
  discover: discoverNodeVersionFiles,
  load: loadNodeVersion,
  write: writeNodeVersion,
}
