/* eslint-disable no-console */
import { execa } from 'execa'
import c from 'picocolors'
import prompts from 'prompts'
import { createMultiProgresBar } from '../../log'
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

export async function checkGlobal(options: CheckOptions) {
  let exitCode = 0
  let resolvePkgs: PackageMeta[] = []

  const pkg = await loadGlobalPackage(options)
  const bars = options.loglevel === 'silent' ? null : createMultiProgresBar()
  const depBar = bars?.create(pkg.deps.length, 0, { type: c.green('dep') })

  await resolvePackage(
    pkg,
    options,
    () => true,
    (_pkgName, name, progress) => depBar?.update(progress, { name }),
  )
  bars?.stop()

  resolvePkgs = [pkg]

  if (options.interactive)
    resolvePkgs = await promptInteractive(resolvePkgs, options)

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

    await installPkg(resolvePkgs[0])
  }

  return exitCode
}

async function loadGlobalPackage(options: CheckOptions): Promise<PackageMeta> {
  const { stdout } = await execa('npm', ['ls', '--global', '--depth=0', '--json'], { stdio: 'pipe' })
  const npmOut = JSON.parse(stdout) as NpmOut
  const filter = createDependenciesFilter(options.include, options.exclude)

  const deps: RawDep[] = Object.entries(npmOut.dependencies)
    .filter(([_name, i]) => i?.version)
    .map(([name, i]) =>
      ({
        name,
        currentVersion: `^${i.version}`,
        update: filter(name),
        source: 'dependencies',
      }),
    )

  return {
    resolved: [],
    raw: null,
    version: '',
    filepath: '',
    relative: '',
    deps,
    name: c.red('npm') + c.gray(c.dim(' (global)')),
  }
}

async function installPkg(pkg: PackageMeta) {
  const changes = pkg.resolved.filter(i => i.update)
  const dependencies = dumpDependencies(changes, 'dependencies')
  const updateArgs = Object.entries(dependencies).map(([name, version]) => `${name}@${version}`)
  await execa('npm', ['install', '-g', ...updateArgs])
}
