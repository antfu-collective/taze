import path from 'path'
import { promises as fs } from 'fs'
import fg from 'fast-glob'
import { CheckOptions, PackageMeta } from '../types'
import { parseDependencies, dumpDependencies } from './dependencies'

export async function readJSON(filepath: string) {
  return JSON.parse(await fs.readFile(filepath, 'utf-8'))
}

export async function writeJSON(filepath: string, data: any) {
  return await fs.writeFile(filepath, `${JSON.stringify(data, null, 2)}\n`, 'utf-8')
}

export async function writePackage(pkg: PackageMeta) {
  const { raw, filepath, resolved } = pkg
  if (raw.dependencies) raw.dependencies = dumpDependencies(resolved, 'dependencies')
  if (raw.devDependencies) raw.devDependencies = dumpDependencies(resolved, 'devDependencies')
  if (raw.peerDependencies) raw.peerDependencies = dumpDependencies(resolved, 'peerDependencies')
  if (raw.optionalDependencies) raw.optionalDependencies = dumpDependencies(resolved, 'optionalDependencies')
  await writeJSON(filepath, raw)
}

export async function loadPackage(root: string, relative: string): Promise<PackageMeta> {
  const filepath = path.resolve(root, relative)
  const raw = await readJSON(filepath)
  const deps = [
    ...parseDependencies(raw, 'dependencies'),
    ...parseDependencies(raw, 'devDependencies'),
    ...parseDependencies(raw, 'peerDependencies'),
    ...parseDependencies(raw, 'optionalDependencies'),
  ]

  return {
    name: raw.name,
    version: raw.version,
    relative,
    filepath,
    raw,
    deps,
    resolved: [],
  }
}

export async function loadPackages(options: CheckOptions) {
  let packagesNames: string[] = []

  if (options.recursive) {
    packagesNames = await fg('**/package.json', {
      ignore: [
        '**/node_modules/**',
        '**/dist/**',
        '**/public/**',
      ],
      cwd: options.cwd,
      onlyFiles: true,
    })
  }
  else {
    packagesNames = ['package.json']
  }

  const packages = await Promise.all(
    packagesNames.map(
      relative => loadPackage(options.cwd, relative),
    ),
  )

  return packages
}
