import type {
  CheckOptions,
  ColorsOptions,
  DepType,
  DiffType,
  InteractiveContext,
  PackageMeta,
  ResolvedDepChange,
} from '../../types'
import { stripVTControlCharacters } from 'node:util'
import { findMinimumForRange, normalize } from 'verkit'
import {
  colorizeNodeCompatibility,
  colorizeVersionDiff,
  createFigures,
  formatTable,
} from '../../render'
import { DependenciesTypeShortMap } from '../../types'
import { createColors } from '../../utils/colors'
import { DiffColorMap } from '../../utils/diff'
import { sortDepChanges } from '../../utils/sort'

import { timeDifference } from '../../utils/time'

function renderChange(
  change: ResolvedDepChange,
  interactive?: InteractiveContext,
  grouped = false,
  timediff = true,
  nodecompat = true,
  colors: ColorsOptions = {},
) {
  const c = createColors(colors)
  const { FIG_CHECK, FIG_NO_POINTER, FIG_POINTER, FIG_UNCHECK } = createFigures(colors)
  const update = change.update && (!interactive || interactive.isChecked(change))
  const pre = interactive
    ? [
        interactive.isSelected(change) ? FIG_POINTER : FIG_NO_POINTER,
        interactive.isChecked(change) ? FIG_CHECK : FIG_UNCHECK,
      ].join('')
    : ' '

  let name = change.name
  if (change.aliasName)
    name = c.dependencyAlias.dim`${change.aliasName} ← ` + change.name

  return [
    `${pre} ${update ? change.provenanceDowngraded ? c.provenanceWarningBg(name) : c.dependencyName(name) : c.dependencyUnselected(name)}`,
    grouped ? '' : c.dependencyType(DependenciesTypeShortMap[change.source]),
    timediff ? timeDifference(change.currentVersionTime, undefined, colors) : '',
    c.versionCurrent(change.currentVersion),
    update ? c.dim.versionArrow('→') : '',
    update
      ? change.diff === 'pin'
        ? `${c.versionPin(change.githubAction?.targetSha?.slice(0, 7) ?? change.targetVersion)} ${c.dim(`# ${change.targetVersion}`)}`
        : colorizeVersionDiff(change.currentVersion, change.targetVersion, true, colors)
      : c.dependencyUnselected.strikethrough(change.targetVersion),
    update && timediff
      ? timeDifference(change.targetVersionTime, undefined, colors)
      : '',
    (change.latestVersionAvailable && normalize(findMinimumForRange(change.targetVersion) ?? change.targetVersion) !== change.latestVersionAvailable)
      ? c.dim.versionAvailable`(${change.latestVersionAvailable} available)`
      : '',
    nodecompat
      ? colorizeNodeCompatibility(change.nodeCompatibleVersion, colors)
      : '',
    change.provenanceDowngraded
      ? `🦠 ${c.bold.provenanceCurrent(formatProvenance(change.currentProvenance))} ${c.dim.provenanceArrow`→`} ${c.bold.provenanceTarget(formatProvenance(change.targetProvenance))}`
      : '',
  ]
}

function formatProvenance(value: boolean | 'trustedPublisher' | undefined) {
  return value === 'trustedPublisher' ? 'trusted' : value ? 'provenance' : 'untrusted'
}

export function renderChanges(
  pkg: PackageMeta,
  options: CheckOptions,
  interactive?: InteractiveContext,
) {
  const { colors = {} } = options
  const c = createColors(colors)
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

    const catalogPrefix = ['pnpm-catalog:', 'bun-catalog:', 'yarn-catalog:']
      .find(p => pkg.name?.startsWith(p))
    const displayName = catalogPrefix
      ? c.dim(catalogPrefix) + c.catalogName(pkg.name!.slice(catalogPrefix.length))
      : pkg.name
        ? c.packageName(pkg.name)
        : c.packagePathMarker('›') + c.dim(` ${filepath || ''}`.trimEnd())

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
        colors,
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
        lines.push(`  ${c.dependencyGroup(key)}`)
        lines.push(...group.map(change => `  ${changeToTable.get(change)!}`))
      }
    }
    else {
      lines.push(...table)
    }

    if (changes.some(c => c.provenanceDowngraded)) {
      lines.push(c.provenanceWarning.bold`\n🦠 The package provenance has been downgraded, which may indicate a risk of malicious publishing. Please carefully review the package contents and check community feedback.`)
    }

    lines.push('')
  }
  else if (options.all) {
    lines.push(`${c.packageName(pkg.name)} ${c.dim(filepath)}`)
    lines.push()
    lines.push(c.upToDate('  ✓ up to date'))
  }

  const errors = pkg.resolved.filter(i => i.resolveError != null)

  if (errors.length) {
    lines.push()
    for (const dep of errors)
      errLines.push(...renderResolveError(dep, colors))
    lines.push()
  }

  return {
    lines,
    errLines,
  }
}

function renderResolveError(dep: ResolvedDepChange, colors: ColorsOptions = {}) {
  const c = createColors(colors)
  const lines: string[] = []

  if (dep.resolveError == null)
    return lines

  if (dep.resolveError === '404') {
    lines.push(c.messageError`> ${c.underline(dep.name)} not found`)
  }
  else if (dep.resolveError === 'invalid_range') {
    // lines.push(c.messageWarning(`> ${c.underline(dep.name)} has an unresolvable version range: ${c.underline(dep.currentVersion)}`))
  }
  else {
    lines.push(c.messageError`> ${c.underline(dep.name)} unknown error`)
    lines.push(c.messageError(dep.resolveError.toString()))
  }
  return lines
}

export function outputErr(errLines: string[], colors: ColorsOptions = {}) {
  const c = createColors(colors)
  console.error(c.inverse.messageError.bold` ERROR `)
  console.error()
  console.error(errLines.join('\n'))
  console.error()
}

interface JsonDepChange {
  name: string
  aliasName?: string
  source: DepType
  currentVersion: string
  targetVersion: string
  diff: DiffType
  update: boolean
  latestVersionAvailable?: string
  currentVersionTime?: string
  targetVersionTime?: string
  error?: string
}

interface JsonPackage {
  name: string
  type: PackageMeta['type']
  filepath: string
  relative: string
  resolved: JsonDepChange[]
}

export interface JsonOutput {
  packages: JsonPackage[]
}

export function getJsonOutput(resolvePkgs: PackageMeta[], options: CheckOptions): JsonOutput {
  const packages = resolvePkgs.map((pkg): JsonPackage => {
    const resolved = (options.all ? pkg.resolved : pkg.resolved.filter(i => i.update))
      .map((change): JsonDepChange => ({
        name: change.name,
        ...(change.aliasName ? { aliasName: change.aliasName } : {}),
        source: change.source,
        currentVersion: change.currentVersion,
        targetVersion: change.targetVersion,
        diff: change.diff,
        update: change.update,
        ...(change.latestVersionAvailable ? { latestVersionAvailable: change.latestVersionAvailable } : {}),
        ...(change.currentVersionTime ? { currentVersionTime: change.currentVersionTime } : {}),
        ...(change.targetVersionTime ? { targetVersionTime: change.targetVersionTime } : {}),
        ...(change.resolveError != null ? { error: change.resolveError.toString() } : {}),
      }))

    return {
      // package names may contain ANSI colors (e.g. global packages)
      name: stripVTControlCharacters(pkg.name ?? ''),
      type: pkg.type,
      filepath: pkg.filepath,
      relative: pkg.relative,
      resolved,
    }
  })

  return { packages }
}

export function outputJson(resolvePkgs: PackageMeta[], options: CheckOptions) {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(getJsonOutput(resolvePkgs, options), null, 2))
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
