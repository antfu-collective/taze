import type { SingleBar } from 'cli-progress'
import type {
  CheckOptions,
  PackageMeta,
} from '../../types'
/* eslint-disable no-console */
import { detect, parseNi, parseNu, run } from '@antfu/ni'
import c from 'picocolors'
import prompts from 'prompts'
import { builtinAddons } from '../../addons'
import { CheckPackages } from '../../api/check'
import { writePackage } from '../../io/packages'
import { createMultiProgressBar } from '../../log'
import { promptInteractive } from './interactive'
import { outputErr, renderPackages } from './render'

export async function check(options: CheckOptions) {
  let exitCode = 0
  const bars = options.loglevel === 'silent' ? null : createMultiProgressBar()
  let packagesBar: SingleBar | undefined
  const depBar = bars?.create(1, 0)

  let resolvePkgs: PackageMeta[] = []

  await CheckPackages(options, {
    afterPackagesLoaded(pkgs) {
      packagesBar = (options.recursive && pkgs.length)
        ? bars?.create(pkgs.length, 0, { type: c.cyan('pkg'), name: c.cyan(pkgs[0].name) })
        : undefined
    },
    beforePackageStart(pkg) {
      packagesBar?.increment(0, { name: c.cyan(pkg.name) })
      depBar?.start(pkg.deps.length, 0, { type: c.green('dep'), name: '' })
    },
    beforePackageWrite() {
      // disbale auto write
      return false
    },
    afterPackageEnd(pkg) {
      packagesBar?.increment(1)
      depBar?.stop()
      resolvePkgs.push(pkg)
    },
    onDependencyResolved(pkgName, name, progress) {
      depBar?.update(progress, { name })
    },
  })

  bars?.stop()

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

  if (!options.all) {
    const counter = resolvePkgs.reduce((counter, pkg) => {
      for (let i = 0; i < pkg.resolved.length; i++) {
        if (pkg.resolved[i].update)
          return ++counter
      }
      return counter
    }, 0)

    const last = resolvePkgs.length - counter

    if (last === 1)
      console.log(c.green('dependencies are already up-to-date in one package\n'))
    else if (last > 0)
      console.log(c.green(`dependencies are already up-to-date in ${last} packages\n`))
  }

  if (errLines.length)
    outputErr(errLines)

  if (options.interactive && !options.write) {
    options.write = await prompts([
      {
        name: 'write',
        type: 'confirm',
        initial: true,
        message: c.green('write to package.json'),
      },
    ]).then(r => r.write)
  }

  if (options.write) {
    for (const pkg of resolvePkgs) {
      // TODO: somehow make this field controlable by CLI?
      for (const addon of (options.addons || builtinAddons)) {
        await addon.postprocess?.(pkg, options)
      }
      await writePackage(pkg, options)
    }
  }

  // tips
  if (!options.write) {
    console.log()

    if (options.mode === 'default')
      console.log(`Run ${c.cyan('taze major')} to check major updates`)

    if (hasChanges) {
      if (options.failOnOutdated)
        exitCode = 1

      console.log(`Add ${c.green('-w')} to write to package.json`)
    }

    console.log()
  }
  else if (hasChanges) {
    if (!options.install && !options.update && !options.interactive) {
      const packageManager = await detect()
      console.log(
        c.yellow(`ℹ changes written to package.json, run ${c.cyan(`${packageManager} i`)} to install updates.`),
      )
    }

    if (options.install || options.update || options.interactive)
      console.log(c.yellow('ℹ changes written to package.json'))

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

    if (options.install) {
      console.log(c.magenta('installing...'))
      console.log()

      await run(parseNi, [])
    }

    if (options.update) {
      console.log(c.magenta('updating...'))
      console.log()

      await run(parseNu, options.recursive ? ['-r'] : [])
    }
  }

  return exitCode
}
