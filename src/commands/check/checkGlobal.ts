import type { CheckOptions, GlobalPackageMeta, RawDep } from '../../types'
/* eslint-disable no-console */
import { existsSync } from 'node:fs'
import os from 'node:os'
import process from 'node:process'
import { getCommand } from '@antfu/ni'
import prompts from '@posva/prompts'
import c from 'ansis'
import { join } from 'pathe'
import { exec } from 'tinyexec'
import { isValidRange } from 'verkit'
import { createMultiProgressBar } from '../../log'
import { dumpDependencies, parseDependency } from '../../manifests/dependencies'
import { readJSON } from '../../manifests/json'
import { parseAliasedPackage, resolvePackage } from '../../registries'
import { createDependenciesFilter } from '../../utils/dependenciesFilter'
import { promptInteractive } from './interactive'
import { outputErr, outputJson, renderPackages } from './render'

interface NpmOut {
  dependencies: {
    [name: string]: {
      version?: string
    }
  }
}

interface PnpmOut {
  path: string
  dependencies: {
    [name: string]: {
      version: string
    }
  }
}

interface BunManifest {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
}

export async function checkGlobal(options: CheckOptions) {
  let exitCode = 0
  let resolvePkgs: GlobalPackageMeta[] = []

  const globalPkgs = await Promise.all([
    loadGlobalNpmPackage(options),
    loadGlobalPnpmPackage(options),
    loadGlobalBunPackage(options),
  ])
  const pkgs = globalPkgs.flat(1)

  const bars = (options.loglevel === 'silent' || options.json)
    ? null
    : createMultiProgressBar()
  await Promise.all(pkgs.map(async (pkg) => {
    const depBar = bars?.create(pkg.deps.length, 0, { type: c.green(pkg.agent) })
    await resolvePackage(
      pkg,
      options,
      () => true,
      (_pkgName, name, progress) => depBar?.update(progress, { name }),
    )
  }))
  bars?.stop()

  resolvePkgs = pkgs

  // In JSON mode we only report the resolved update info. `interactive` is
  // ignored and no tables, tips, or install steps are printed.
  if (options.json) {
    outputJson(resolvePkgs, options)

    const hasChanges = resolvePkgs.length && resolvePkgs.some(i => i.resolved.some(j => j.update))
    if (hasChanges && options.failOnOutdated)
      exitCode = 1

    return exitCode
  }

  if (options.interactive)
    resolvePkgs = await promptInteractive(resolvePkgs, options) as GlobalPackageMeta[]

  const { lines, errLines } = renderPackages(resolvePkgs, options)

  const hasChanges = resolvePkgs.length && resolvePkgs.some(i => i.resolved.some(j => j.update))
  if (!hasChanges) {
    if (errLines.length)
      outputErr(errLines)
    else
      console.log(c.green('dependencies are already up-to-date'))

    return exitCode
  }

  console.log(lines.join('\n'))

  if (errLines.length)
    outputErr(errLines)

  if (options.interactive && !options.install) {
    options.install = await prompts([
      {
        name: 'install',
        type: 'confirm',
        initial: true,
        message: c.green('install now'),
      },
    ]).then(r => r.install)
  }

  if (!options.write) {
    console.log()

    if (options.mode === 'default')
      console.log(`Add ${c.green('major')} to check major updates`)

    if (hasChanges) {
      if (options.failOnOutdated)
        exitCode = 1

      console.log(`Add ${c.green('-i')} to update global dependency`)
    }

    console.log()
  }

  if (options.install) {
    console.log(c.magenta('installing...'))
    console.log()

    for (const pkg of resolvePkgs)
      await installPkg(pkg)
  }

  return exitCode
}

async function loadGlobalPnpmPackage(options: CheckOptions): Promise<GlobalPackageMeta[]> {
  let pnpmStdout

  try {
    pnpmStdout = (await exec('pnpm', ['ls', '--global', '--depth=0', '--json'], { throwOnError: true })).stdout
  }
  catch {
    return []
  }

  const pnpmOuts = (JSON.parse(pnpmStdout) as PnpmOut[]).filter(it => it.dependencies != null)
  const filter = createDependenciesFilter(options.include, options.exclude)

  const pkgMetas: GlobalPackageMeta[] = pnpmOuts.map(
    pnpmOut => Object.entries(pnpmOut.dependencies)
      .filter(([_name, i]) => i?.version)
      .map(([name, i]) => ({
        name,
        currentVersion: `^${i.version}`,
        update: filter(name),
        source: 'dependencies',
      } satisfies RawDep)),
  )
    .map((deps, i) => ({
      agent: 'pnpm',
      type: 'global',
      private: true,
      resolved: [],
      raw: null,
      version: '',
      filepath: '',
      relative: '',
      deps,
      name: c.red`pnpm` + c.gray.dim` (global) ` + c.gray.dim(pnpmOuts[i].path),
    }))

  return pkgMetas
}

export async function loadGlobalBunPackage(options: CheckOptions): Promise<GlobalPackageMeta[]> {
  // Bun has no machine-readable `pm ls -g`, but its global install is a regular
  // project holding the manifest `bun add -g` writes, so read that instead.
  const dir = process.env.BUN_INSTALL_GLOBAL_DIR || join(process.env.BUN_INSTALL || join(os.homedir(), '.bun'), 'install', 'global')
  const filepath = join(dir, 'package.json')
  if (!existsSync(filepath))
    return []

  const manifest = await readJSON(filepath) as BunManifest
  const filter = createDependenciesFilter(options.include, options.exclude)

  // `--dev|--optional|--peer` only decide which field records the package, so
  // every section is installable; optional entries override same-named ones.
  const specs = { ...manifest.devDependencies, ...manifest.peerDependencies, ...manifest.dependencies, ...manifest.optionalDependencies }
  const deps = await Promise.all(Object.entries(specs).map(async ([name, spec]) => {
    const alias = spec.startsWith('npm:') ? parseAliasedPackage(spec) : undefined
    // Whatever is installed outranks the manifest, whose range can lag behind it
    // and whose alias target can be shadowed by a duplicate declaration. Only
    // semver ranges qualify: URLs, git refs, local paths, dist-tags and other
    // protocols keep their declaration, or they would turn into registry packages.
    const installed = alias || isValidRange(spec)
      ? await readInstalledPackage(join(dir, 'node_modules', name))
      : undefined
    // widening a pinned version keeps it from being skipped as locked
    const version = installed?.version ? `^${installed.version}` : alias?.version
    const currentVersion = alias && version ? `npm:${installed?.name ?? alias.name}@${version}` : (version || spec)
    return parseDependency({ name, version: currentVersion, type: 'dependencies', shouldUpdate: filter })
  }))

  return [{
    agent: 'bun',
    type: 'global',
    private: true,
    resolved: [],
    raw: null,
    version: '',
    filepath,
    relative: '',
    deps,
    name: c.red`bun` + c.gray.dim` (global) ` + c.gray.dim(dir),
  }]
}

function readInstalledPackage(dir: string): Promise<{ name?: string, version?: string } | undefined> {
  return readJSON(join(dir, 'package.json')).catch(() => undefined)
}

async function loadGlobalNpmPackage(options: CheckOptions): Promise<GlobalPackageMeta[]> {
  let npmStdout

  try {
    // npm may not be installed at all, e.g. on a bun-only machine
    npmStdout = (await exec('npm', ['ls', '--global', '--depth=0', '--json'], { throwOnError: true })).stdout
  }
  catch {
    return []
  }

  const npmOut = JSON.parse(npmStdout) as NpmOut
  const filter = createDependenciesFilter(options.include, options.exclude)

  let deps: RawDep[] = []
  if ('dependencies' in npmOut) {
    deps = Object.entries(npmOut.dependencies)
      .filter(([_name, i]) => i?.version)
      .map(([name, i]) => ({
        name,
        currentVersion: `^${i.version}`,
        update: filter(name),
        source: 'dependencies',
      }))
  }

  return [{
    agent: 'npm',
    private: true,
    type: 'global',
    resolved: [],
    raw: null,
    version: '',
    filepath: '',
    relative: '',
    deps,
    name: c.red`npm` + c.gray.dim` (global)`,
  }]
}

async function installPkg(pkg: GlobalPackageMeta) {
  const changes = pkg.resolved.filter(i => i.update)
  if (!changes.length)
    return
  const dependencies = dumpDependencies(changes, 'dependencies')
  const updateArgs = Object.entries(dependencies).map(([name, version]) => `${name}@${version}`)
  const install = getCommand(pkg.agent, 'global', [...updateArgs])
  await exec(install.command, install.args, { throwOnError: true })
}
