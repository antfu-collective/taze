import c from 'picocolors'
import semver from 'semver'
import type {
  CheckOptions,
  InteractiveContext,
  PackageMeta,
  ResolvedDepChange,
} from '../../types'
import { DependenciesTypeShortMap } from '../../types'
import { timeDifference } from '../../utils/time'
import { colorizeVersionDiff, formatTable } from '../../render'

export function renderChange(change: ResolvedDepChange, interactive?: InteractiveContext) {
  const update = change.update && (!interactive || change.interactiveChecked)
  const isSelected = interactive && interactive.isSelected(change)
  const pre = interactive
    ? [
        isSelected ? c.cyan('❯ ') : '  ',
        change.interactiveChecked ? c.green('☑️') : c.gray('☐'),
      ].join('')
    : ' '

  return [
    `${pre} ${update ? change.name : c.gray(change.name)}`,
    c.gray(DependenciesTypeShortMap[change.source]),
    timeDifference(change.currentVersionTime),
    c.gray(change.currentVersion),
    update ? c.dim(c.gray('→')) : '',
    update ? colorizeVersionDiff(change.currentVersion, change.targetVersion) : c.gray(c.strikethrough(change.targetVersion)),
    update ? timeDifference(change.targetVersionTime) : '',
    change.latestVersionAvailable && semver.minVersion(change.targetVersion)!.toString() !== change.latestVersionAvailable
      ? c.dim(c.magenta(`(${change.latestVersionAvailable} available)`))
      : '',
  ]
}

export function renderChanges(
  pkg: PackageMeta,
  options: CheckOptions,
  interactive?: InteractiveContext,
) {
  const { resolved, relative: filepath } = pkg
  const lines: string[] = []
  const errLines: string[] = []

  const changes = options.all
    ? resolved
    : resolved.filter(i => i.update)

  if (changes.length) {
    const diffCounts: Record<string, number> = {}
    changes
      .filter(i => !interactive || i.interactiveChecked)
      .forEach(({ diff }) => {
        if (!diff)
          return
        if (!diffCounts[diff])
          diffCounts[diff] = 0
        diffCounts[diff] += 1
      })
    const diffEntries = Object.keys(diffCounts).length
      ? Object.entries(diffCounts)
        .map(([key, value]) => `${c.yellow(value)} ${key}`)
        .join(', ')
      : c.dim('no change')

    lines.push(
      // c.dim(c.gray(filepath)),
      `${c.cyan(pkg.name ?? '›')} ${c.dim('-')} ${diffEntries}`,
      '',
    )

    lines.push(...formatTable(
      changes.map(c => renderChange(c, interactive)),
      'LLRRRRRL',
    ))

    lines.push('')
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
      errLines.push(...renderResolveError(dep))
    lines.push()
  }

  return {
    lines,
    errLines,
  }
}
function renderResolveError(dep: ResolvedDepChange) {
  const lines: string[] = []

  if (dep.resolveError == null)
    return lines

  if (dep.resolveError === '404') {
    lines.push(c.red(`> ${c.underline(dep.name)} not found`))
  }
  else if (dep.resolveError === 'invalid_range') {
    lines.push(
      c.yellow(`> ${c.underline(dep.name)} has an unresolvable version range: ${c.underline(dep.currentVersion)}`),
    )
  }
  else {
    lines.push(c.red(`> ${c.underline(dep.name)} unknown error`))
    lines.push(c.red(dep.resolveError.toString()))
  }
  return lines
}

export function renderPackages(resolvePkgs: PackageMeta[], options: CheckOptions) {
  const lines: string[] = ['']
  const errLines: string[] = []

  resolvePkgs.forEach((pkg) => {
    const result = renderChanges(pkg, options)
    lines.push(...result.lines)
    errLines.push(...result.errLines)
  })

  return { lines, errLines }
}

