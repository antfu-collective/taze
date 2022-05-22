import c from 'picocolors'
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
    update ? timeDifference(change.currentVersionTime) : '',
    update ? c.gray(change.currentVersion) : '',
    update ? c.dim(c.gray('→')) : '',
    update ? colorizeVersionDiff(change.currentVersion, change.targetVersion) : c.gray(change.currentVersion),
    timeDifference(change.targetVersionTime),
    change.latestVersionAvailable ? c.dim(c.magenta(`(${change.latestVersionAvailable} available)`)) : '',
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
    lines.push(`${c.cyan(pkg.name ?? '›')} ${c.dim(filepath)}`, '')

    lines.push(...formatTable(
      changes.map(c => renderChange(c, interactive)),
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

