/* eslint-disable no-console */
import c from 'picocolors'
import type { SingleBar } from 'cli-progress'
import { parseNi, parseNu, run } from '@antfu/ni'
import { createMultiProgresBar } from '../log'
import type {
  CheckOptions,
  PackageMeta,
  ResolvedDepChange,
} from '../types'
import {
  DependenciesTypeShortMap,
} from '../types'
import { timeDifference } from '../utils/time'
import { CheckPackages } from '../api/check'
import { colorizeVersionDiff, formatTable } from '../render'

export async function check(options: CheckOptions) {
  const bars = options.loglevel === 'silent' ? null : createMultiProgresBar()
  let packagesBar: SingleBar | undefined
  const depBar = bars?.create(1, 0)

  const resolvePkgs: PackageMeta[] = []

  await CheckPackages(options, {
    afterPackagesLoaded(pkgs) {
      packagesBar = options.recursive && pkgs.length
        ? bars?.create(pkgs.length, 0, { type: c.cyan('pkg'), name: c.cyan(pkgs[0].name) })
        : undefined
    },
    beforePackageStart(pkg) {
      packagesBar?.increment(0, { name: c.cyan(pkg.name) })
      depBar?.start(pkg.deps.length, 0, { type: c.green('dep') })
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

  const hasChanges = resolvePkgs.length && resolvePkgs.some(i => i.resolved.some(j => j.update))

  const lines: string[] = ['']
  const errLines: string[] = []

  resolvePkgs.forEach((pkg) => {
    const result = printChanges(pkg, options)
    lines.push(...result.lines)
    errLines.push(...result.errLines)
  })

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
      console.log(c.green('dependencies are already up-to-date in one package'))
    else if (last > 0)
      console.log(c.green(`dependencies are already up-to-date in ${last} packages`))
  }

  console.log(lines.join('\n'))
  if (errLines.length) {
    console.error(c.inverse(c.red(c.bold(' ERROR '))))
    console.error()
    console.error(errLines.join('\n'))
    console.error()
  }

  // tips
  if (!options.write) {
    console.log()

    if (options.mode === 'default')
      console.log(`Run ${c.cyan('taze major')} to check major updates`)

    if (hasChanges)
      console.log(`Run ${c.green('taze -w')} to write package.json`)

    console.log()
  }
  else if (hasChanges) {
    if (!options.install && !options.update) {
      console.log(
        c.yellow(`changes wrote to package.json, run ${c.cyan('npm i')} to install updates.`),
      )
    }

    if (options.install || options.update)
      console.log(c.yellow('changes wrote to package.json'))

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
}

export function renderChange(change: ResolvedDepChange) {
  return [
    `  ${change.name}`,
    c.gray(DependenciesTypeShortMap[change.source]),
    change.update ? timeDifference(change.currentVersionTime) : '',
    change.update ? c.gray(change.currentVersion) : '',
    c.dim(c.gray(change.update ? '→' : '-')),
    change.update ? colorizeVersionDiff(change.currentVersion, change.targetVersion) : c.gray(change.targetVersion),
    timeDifference(change.targetVersionTime),
    change.latestVersionAvailable ? c.dim(c.magenta(`(${change.latestVersionAvailable} available)`)) : '',
  ]
}

export function printChanges(
  pkg: PackageMeta,
  options: CheckOptions,
) {
  const { resolved, relative: filepath } = pkg
  const lines: string[] = []
  const errLines: string[] = []

  const changes = options.all
    ? resolved
    : resolved.filter(i => i.update)

  if (changes.length) {
    lines.push(`${c.cyan(pkg.name ?? '›')} ${c.dim(filepath)}`, '')

    lines.push(...formatTable(
      changes.map(c => renderChange(c)),
      'LLRRRRRL',
    ))

    const counters: Record<string, number> = {}

    changes.forEach(({ diff }) => {
      if (!diff)
        return
      if (!counters[diff])
        counters[diff] = 0

      counters[diff] += 1
    })

    if (Object.keys(counters).length) {
      const versionEntries = Object.entries(counters)
        .map(([key, value]) => `${c.yellow(value)} ${key}`)
        .join(', ')

      lines.push('', c.gray(`  ${versionEntries} updates`), '')
    }
  }
  else if (options.all) {
    lines.push(`${c.cyan(pkg.name)} ${c.dim(filepath)}`)
    lines.push()
    lines.push(c.gray('  ✓ up to date'))
  }

  const errors = pkg.resolved.filter(i => i.resolveError != null)

  if (errors.length) {
    lines.push()
    for (const dep of errors)
      errLines.push(...printResolveError(dep))
    lines.push()
  }

  return {
    lines,
    errLines,
  }
}

function printResolveError(dep: ResolvedDepChange) {
  const lines: string[] = []

  if (dep.resolveError == null)
    return lines

  if (dep.resolveError === '404') {
    lines.push(c.red(`> ${c.underline(dep.name)} not found`))
  }
  else if (dep.resolveError === 'invalid_range') {
    lines.push(
      c.yellow(`> ${
        c.underline(dep.name)
      } has an unresolvable version range: ${
        c.underline(dep.currentVersion)
      }`),
    )
  }
  else {
    lines.push(c.red(`> ${c.underline(dep.name)} unknown error`))
    lines.push(c.red(dep.resolveError.toString()))
  }
  return lines
}
