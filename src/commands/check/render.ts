import type {
  CheckOptions,
  DiffType,
  InteractiveContext,
  PackageMeta,
  ResolvedDepChange,
} from '../../types'
import c from 'ansis'
import semver from 'semver'
import {
  colorizeNodeCompatibility,
  colorizeVersionDiff,
  FIG_CHECK,
  FIG_NO_POINTER,
  FIG_POINTER,
  FIG_UNCHECK,
  formatTable,
} from '../../render'
import { DependenciesTypeShortMap } from '../../types'
import { DiffColorMap } from '../../utils/diff'
import { sortDepChanges } from '../../utils/sort'

import { timeDifference } from '../../utils/time'

export function renderChange(
  change: ResolvedDepChange,
  interactive?: InteractiveContext,
  grouped = false,
  timediff = true,
  nodecompat = true,
) {
  const update = change.update && (!interactive || interactive.isChecked(change))
  const pre = interactive
    ? [
        interactive.isSelected(change) ? FIG_POINTER : FIG_NO_POINTER,
        interactive.isChecked(change) ? FIG_CHECK : FIG_UNCHECK,
      ].join('')
    : ' '

  let name = change.name
  if (change.aliasName)
    name = c.dim`${change.aliasName} ← ` + change.name

  return [
    `${pre} ${update ? name : c.gray(name)}`,
    grouped ? '' : c.gray(DependenciesTypeShortMap[change.source]),
    timediff ? timeDifference(change.currentVersionTime) : '',
    c.gray(change.currentVersion),
    update ? c.dim.gray('→') : '',
    update
      ? colorizeVersionDiff(change.currentVersion, change.targetVersion)
      : c.gray.strikethrough(change.targetVersion),
    update && timediff
      ? timeDifference(change.targetVersionTime)
      : '',
    (change.latestVersionAvailable && semver.minVersion(change.targetVersion)!.toString() !== change.latestVersionAvailable)
      ? c.dim.magenta`(${change.latestVersionAvailable} available)`
      : '',
    nodecompat
      ? colorizeNodeCompatibility(change.nodeCompatibleVersion)
      : '',
    change.provenanceDowngraded
      ? `⚠️  Provenance downgraded: ${c.bold.green(formatProvenance(change.currentProvenance))} ${c.dim.gray`→`} ${c.bold.red(formatProvenance(change.targetProvenance))}`
      : '',
  ]
}

function formatProvenance(value: boolean | 'trustedPublisher' | undefined) {
  return value === 'trustedPublisher' ? 'trusted publisher' : value ? 'provenance' : 'untrusted'
}

export function renderChanges(
  pkg: PackageMeta,
  options: CheckOptions,
  interactive?: InteractiveContext,
) {
  const { resolved, relative: filepath } = pkg
  const lines: string[] = []
  const errLines: string[] = []

  let changes = options.all
    ? resolved
    : resolved.filter(i => i.update)

  const {
    sort = 'diff-asc',
    group = true,
  } = options

  if (changes.length) {
    const diffCounts: Record<string, number> = {}
    changes
      .filter(dep => !interactive || interactive.isChecked(dep))
      .forEach(({ diff }) => {
        if (!diff)
          return
        if (!diffCounts[diff])
          diffCounts[diff] = 0
        diffCounts[diff] += 1
      })

    changes = sortDepChanges(changes, sort, group)

    const diffEntries = Object.keys(diffCounts).length
      ? Object.entries(diffCounts)
          .map(([key, value]) => `${c[DiffColorMap[key as DiffType || 'patch']](value)} ${key}`)
          .join(', ')
      : c.dim('no change')

    const displayName = pkg.name?.startsWith('pnpm-catalog:')
      ? c.dim('pnpm-catalog:') + c.yellow(pkg.name.slice('pnpm-catalog:'.length))
      : pkg.name
        ? c.cyan(pkg.name)
        : c.red('›') + c.dim(` ${filepath || ''}`.trimEnd())

    lines.push(
      `${displayName} ${c.dim('-')} ${diffEntries}`,
      '',
    )

    const table = formatTable(
      changes.map(c => renderChange(
        c,
        interactive,
        group,
        options.timediff ?? true,
        options.nodecompat ?? true,
      )),
      'LLRRRRRLL',
    )

    const changeToTable = new Map(changes.map((change, idx) => [change, table[idx]]))

    if (group) {
      const groups = new Map<string, ResolvedDepChange[]>()
      for (const change of changes) {
        const key = change.source
        if (!groups.has(key))
          groups.set(key, [])
        groups.get(key)!.push(change)
      }
      // Use predefined order
      for (const key of Object.keys(DependenciesTypeShortMap)) {
        const group = groups.get(key)
        if (!group)
          continue
        if (lines.at(-1) !== '')
          lines.push('')
        lines.push(`  ${c.blue(key)}`)
        lines.push(...group.map(change => `  ${changeToTable.get(change)!}`))
      }
    }
    else {
      lines.push(...table)
    }

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
    lines.push(c.red`> ${c.underline(dep.name)} not found`)
  }
  else if (dep.resolveError === 'invalid_range') {
    // lines.push(c.yellow(`> ${c.underline(dep.name)} has an unresolvable version range: ${c.underline(dep.currentVersion)}`))
  }
  else {
    lines.push(c.red`> ${c.underline(dep.name)} unknown error`)
    lines.push(c.red(dep.resolveError.toString()))
  }
  return lines
}

export function outputErr(errLines: string[]) {
  console.error(c.inverse.red.bold` ERROR `)
  console.error()
  console.error(errLines.join('\n'))
  console.error()
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
