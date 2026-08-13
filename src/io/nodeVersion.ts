import type { CommonOptions, NodeVersionMeta } from '../types'
import { constants } from 'node:fs'
import { lstat, open, readFile, realpath } from 'node:fs/promises'
import process from 'node:process'
import { isAbsolute, relative, resolve } from 'pathe'
import { parseVersionReference } from '../utils/versionReference'

const NODE_VERSION_CONTENT_RE = /^(\s*)(v?\d+(?:\.\d+){0,2})(\s*)$/

export async function loadNodeVersion(
  relative: string,
  options: CommonOptions,
  shouldUpdate: (name: string) => boolean,
): Promise<NodeVersionMeta[]> {
  const filepath = resolve(options.cwd ?? '', relative)
  const content = await readFile(filepath, 'utf-8')
  const match = NODE_VERSION_CONTENT_RE.exec(content)
  if (!match)
    return []

  const currentVersion = match[2]
  const parsed = parseVersionReference(currentVersion)
  if (!parsed || parsed.prerelease)
    return []

  return [{
    name: relative,
    private: false,
    version: currentVersion,
    type: 'node-version',
    relative,
    filepath,
    raw: {
      leading: match[1],
      trailing: match[3],
    },
    deps: [{
      name: 'node',
      currentVersion,
      source: 'node-version',
      update: shouldUpdate('node'),
    }],
    resolved: [],
  }]
}

export async function writeNodeVersion(pkg: NodeVersionMeta, options: CommonOptions) {
  const node = pkg.resolved.find(dep => dep.source === 'node-version')
  if (!node?.update)
    return

  const declaredFile = await lstat(pkg.filepath)
  if (!declaredFile.isSymbolicLink() && !declaredFile.isFile())
    throw new Error(`Refusing to write non-regular .node-version file: ${pkg.filepath}`)

  const cwd = await realpath(resolve(options.cwd || process.cwd()))
  const filepath = await realpath(pkg.filepath)
  const relativeFilepath = relative(cwd, filepath)
  if (relativeFilepath === '..' || relativeFilepath.startsWith('../') || isAbsolute(relativeFilepath))
    throw new Error(`Refusing to write .node-version outside cwd: ${pkg.filepath}`)

  const targetFile = await lstat(filepath)
  if (!targetFile.isFile())
    throw new Error(`Refusing to write non-regular .node-version target: ${filepath}`)

  const content = `${pkg.raw.leading}${node.targetVersion}${pkg.raw.trailing}`
  const noFollow = process.platform === 'win32' ? 0 : constants.O_NOFOLLOW ?? 0
  const file = await open(filepath, constants.O_WRONLY | noFollow)
  try {
    await file.truncate(0)
    await file.writeFile(content, 'utf-8')
  }
  finally {
    await file.close()
  }
}
