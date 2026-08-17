import type { Document as DocumentType, Scalar } from 'yaml'
import type { CommonOptions, GitHubActionMeta, GitHubActionsOptions, GitHubActionStyle, PackageMeta, RawDep } from '../../types'
import type { Manifest } from '../types'
import * as fs from 'node:fs/promises'
import process from 'node:process'
import detectIndent from 'detect-indent'
import { resolve } from 'pathe'
import { glob } from 'tinyglobby'
import { isScalar, parseDocument as parseYaml, stringify as stringifyYaml, visit } from 'yaml'
import { DEFAULT_IGNORE_PATHS } from '../../constants'
import { formatUses, parseUses } from '../../utils/github'

export async function writeYAML(filepath: string, data: DocumentType | Record<string, unknown>) {
  const { amount, type } = await fs.readFile(filepath, 'utf-8')
    .then(detectIndent)
    .catch(Object.create)

  const indent = (type === 'tab' ? 2 : amount) ?? 2

  const yamlContent = stringifyYaml(data, {
    indent,
    aliasDuplicateObjects: false,
    lineWidth: 0,
  })

  return fs.writeFile(filepath, yamlContent, 'utf-8')
}

function resolveStyle(options: CommonOptions): GitHubActionStyle {
  const config = options.githubActions
  if (config && typeof config === 'object')
    return (config as GitHubActionsOptions).style ?? 'auto'
  return 'auto'
}

function isGitHubActionsEnabled(options: CommonOptions): boolean {
  return options.githubActions !== false
}

const GITHUB_ACTIONS_FILE_RE = /(?:^|\/)\.github\/workflows\/[^/]+\.ya?ml$/
const GITHUB_ACTION_MANIFEST_RE = /(?:^|\/)action\.ya?ml$/

function isGitHubActionsPath(filepath: string): boolean {
  return GITHUB_ACTIONS_FILE_RE.test(filepath) || GITHUB_ACTION_MANIFEST_RE.test(filepath)
}

async function loadGitHubActionsFiles(options: CommonOptions): Promise<string[]> {
  const ignore = DEFAULT_IGNORE_PATHS.concat(options.ignorePaths || [])
  const patterns = options.recursive
    ? [
        '**/.github/workflows/*.yml',
        '**/.github/workflows/*.yaml',
        '**/.github/actions/**/action.yml',
        '**/.github/actions/**/action.yaml',
        '**/action.yml',
        '**/action.yaml',
      ]
    : [
        '.github/workflows/*.yml',
        '.github/workflows/*.yaml',
        '.github/actions/**/action.yml',
        '.github/actions/**/action.yaml',
        'action.yml',
        'action.yaml',
      ]

  const files = await glob(patterns, {
    cwd: resolve(options.cwd || process.cwd()),
    ignore,
    onlyFiles: true,
    dot: true,
    expandDirectories: false,
  })

  return [...new Set(files)].sort((a, b) => a.localeCompare(b))
}

async function loadGitHubAction(
  relative: string,
  options: CommonOptions,
  shouldUpdate: (name: string) => boolean,
): Promise<PackageMeta[]> {
  const filepath = resolve(options.cwd ?? '', relative)
  const content = await fs.readFile(filepath, 'utf-8')
  const doc = parseYaml(content)

  if (doc.errors.length)
    return []

  const deps: RawDep[] = []

  visit(doc, {
    Pair(_, pair: any) {
      const key = pair.key
      const value = pair.value
      if (!key || key.value !== 'uses' || !isScalar(value) || typeof value.value !== 'string')
        return

      const parsed = parseUses(value.value, value.comment)
      if (!parsed)
        return

      deps.push({
        name: parsed.repo,
        currentVersion: parsed.tag,
        source: 'github-actions',
        packageType: 'github-actions',
        update: shouldUpdate(parsed.repo),
        githubAction: {
          repo: parsed.repo,
          subpath: parsed.subpath,
          style: parsed.style,
          sha: parsed.sha,
          node: value as Scalar,
        },
      })
    },
  })

  if (!deps.length)
    return []

  return [
    {
      name: relative,
      private: false,
      version: '',
      type: 'github-action',
      relative,
      filepath,
      get raw() {
        return doc.toJS() as Record<string, unknown>
      },
      yamlDocument: doc,
      deps,
      resolved: [],
    } satisfies GitHubActionMeta,
  ]
}

async function writeGitHubAction(
  pkg: PackageMeta,
  options: CommonOptions,
) {
  if (pkg.type !== 'github-action')
    throw new Error('Package type is not supported')

  const configuredStyle = resolveStyle(options)
  let changed = false

  for (const dep of pkg.resolved) {
    if (!dep.update || !dep.githubAction)
      continue

    const { repo, subpath, node, targetSha } = dep.githubAction
    if (!node)
      continue

    const effectiveStyle = configuredStyle === 'auto' ? dep.githubAction.style : configuredStyle

    if (effectiveStyle === 'sha') {
      if (!targetSha)
        continue // cannot pin without a resolved SHA; leave untouched
      node.value = formatUses(repo, subpath, targetSha)
      node.comment = ` ${dep.targetVersion}`
    }
    else {
      node.value = formatUses(repo, subpath, dep.targetVersion)
      // drop any stale version comment when writing a tag reference
      node.comment = undefined
    }

    changed = true
  }

  if (changed) {
    await writeYAML(pkg.filepath, pkg.yamlDocument)
  }
}

export const githubActionsManifest: Manifest = {
  name: 'github-action',
  type: 'github-action',
  order: 1,
  enabled: isGitHubActionsEnabled,
  match: isGitHubActionsPath,
  discover: loadGitHubActionsFiles,
  load: loadGitHubAction,
  write: (pkg, options) => writeGitHubAction(pkg, options),
}
