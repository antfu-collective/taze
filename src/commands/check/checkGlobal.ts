/* eslint-disable no-console */
import { exec } from 'tinyexec'
import c from 'picocolors'
import prompts from 'prompts'
import { type Agent, getCommand } from '@antfu/ni'
import { createMultiProgressBar } from '../../log'
import type { CheckOptions, PackageMeta, RawDep } from '../../types'
import { dumpDependencies } from '../../io/dependencies'
import { resolvePackage } from '../../io/resolves'
import { createDependenciesFilter } from '../../utils/dependenciesFilter'
import { promptInteractive } from './interactive'
import { outputErr, renderPackages } from './render'

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

interface GlobalPackageMeta extends PackageMeta {
  agent: Agent
}

export async function checkGlobal(options: CheckOptions) {
  let exitCode = 0
  let resolvePkgs: GlobalPackageMeta[] = []

  const globalPkgs = await Promise.all([
    loadGlobalNpmPackage(options),
    loadGlobalPnpmPackage(options),
  ])
  const pkgs = globalPkgs.flat(1)

  const bars = options.loglevel === 'silent'
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
    pnpmStdout = (await exec('pnpm', ['ls', '--global', '--depth=0', '--json'])).stdout
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
      name: c.red('pnpm') + c.gray(c.dim(' (global)')) + c.gray(c.dim(` ${pnpmOuts[i].path}`)),
    }))

  return pkgMetas
}

async function loadGlobalNpmPackage(options: CheckOptions): Promise<GlobalPackageMeta> {
  const { stdout } = await exec('npm', ['ls', '--global', '--depth=0', '--json'])
  const npmOut = JSON.parse(stdout) as NpmOut
  const filter = createDependenciesFilter(options.include, options.exclude)

  const deps: RawDep[] = Object.entries(npmOut.dependencies)
    .filter(([_name, i]) => i?.version)
    .map(([name, i]) => ({
      name,
      currentVersion: `^${i.version}`,
      update: filter(name),
      source: 'dependencies',
    }))

  return {
    agent: 'npm',
    private: true,
    type: 'global',
    resolved: [],
    raw: null,
    version: '',
    filepath: '',
    relative: '',
    deps,
    name: c.red('npm') + c.gray(c.dim(' (global)')),
  }
}

async function installPkg(pkg: GlobalPackageMeta) {
  const changes = pkg.resolved.filter(i => i.update)
  const dependencies = dumpDependencies(changes, 'dependencies')
  const updateArgs = Object.entries(dependencies).map(([name, version]) => `${name}@${version}`)
  const installCommand = getCommand(pkg.agent, 'global', [...updateArgs])
  await exec(installCommand)
}
