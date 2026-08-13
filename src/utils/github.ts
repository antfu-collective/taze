import type { RangeMode } from '../types'
import type { ParsedVersionReference } from './versionReference'
import { spawnSync } from 'node:child_process'
import process from 'node:process'
import { createDebug } from 'obug'
import { fetch as ofetch } from 'ofetch'
import { compareVersionReferences, parseVersionReference, selectVersionTarget } from './versionReference'

const debug = createDebug('taze:github')

const GITHUB_API = 'https://api.github.com'
const USER_AGENT = `taze@npm node/${process.version}`
const MAX_TAG_PAGES = 10
const SHA_RE = /^[0-9a-f]{40}$/i
export type ParsedTag = ParsedVersionReference

export interface ParsedUses {
  /** `owner/repo` */
  repo: string
  /** subpath after `owner/repo`, including leading slash, or `''` */
  subpath: string
  /** current version tag (v-prefixed), from the ref or the trailing comment */
  tag: string
  /** how the reference is written */
  style: 'tag' | 'sha'
  /** current commit SHA when SHA-pinned */
  sha?: string
}

export interface GitHubActionTags {
  /** v-prefixed tag names, sorted ascending by semver */
  versions: string[]
  /** map of tag -> commit SHA */
  shaMap: Record<string, string>
  error?: string
}

let ghCliToken: string | undefined
let ghCliTokenResolved = false

/**
 * Resolve a token from the `gh` CLI (`gh auth token`) as a fallback when no
 * environment token is set. The result is cached (including a negative result)
 * so `gh` is spawned at most once per process.
 */
function resolveGhCliToken(): string | undefined {
  if (ghCliTokenResolved)
    return ghCliToken

  ghCliTokenResolved = true
  try {
    const result = spawnSync('gh', ['auth', 'token'], {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    const token = result.status === 0 ? result.stdout?.trim() : undefined
    if (token) {
      debug('using token resolved from the gh CLI')
      ghCliToken = token
    }
  }
  catch {
    // `gh` not installed or failed — fall back to unauthenticated requests
  }

  return ghCliToken
}

export function getGitHubToken(): string | undefined {
  return process.env.GITHUB_TOKEN || process.env.GH_TOKEN || resolveGhCliToken()
}

function githubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'accept': 'application/vnd.github+json',
    'user-agent': USER_AGENT,
    'x-github-api-version': '2022-11-28',
  }
  const token = getGitHubToken()
  if (token)
    headers.authorization = `Bearer ${token}`
  return headers
}

/**
 * Parse the version core of a v-prefixed tag. Only tags that begin with `v`
 * followed by a digit are considered; everything else (branches like `main`,
 * bare numeric tags, `latest`, ...) returns `null` and is skipped.
 */
export function parseVersionTag(tag: string): ParsedTag | null {
  return parseVersionReference(tag, true)
}

/**
 * Parse a workflow/action `uses:` value into an updatable action reference,
 * or return `null` when it should be skipped (local action, docker action,
 * branch ref, non-`v` tag, or a SHA pin without a `# vX.Y.Z` comment).
 */
export function parseUses(uses: string, comment?: string | null): ParsedUses | null {
  if (typeof uses !== 'string')
    return null

  const trimmed = uses.trim()
  // local (`./path`) and docker (`docker://...`) actions are not versioned tags
  if (trimmed.startsWith('.') || trimmed.startsWith('docker://'))
    return null

  const atIndex = trimmed.lastIndexOf('@')
  if (atIndex <= 0)
    return null

  const spec = trimmed.slice(0, atIndex)
  const ref = trimmed.slice(atIndex + 1)

  const segments = spec.split('/')
  if (segments.length < 2 || !segments[0] || !segments[1])
    return null

  const repo = `${segments[0]}/${segments[1]}`
  const subpath = segments.length > 2 ? `/${segments.slice(2).join('/')}` : ''

  if (SHA_RE.test(ref)) {
    const tag = extractVersionFromComment(comment)
    if (!tag)
      return null
    return { repo, subpath, tag, style: 'sha', sha: ref }
  }

  if (parseVersionTag(ref))
    return { repo, subpath, tag: ref, style: 'tag' }

  // branch refs and non-`v` tags are intentionally skipped
  return null
}

export function extractVersionFromComment(comment?: string | null): string | undefined {
  if (!comment)
    return undefined
  const match = /(?:^|\s)(v\d+(?:\.\d+)*(?:[-+][\w.]+)?)/.exec(comment)
  return match?.[1]
}

export function formatUses(repo: string, subpath: string, ref: string): string {
  return `${repo}${subpath}@${ref}`
}

export interface SelectTargetOptions {
  /** reject specific candidate tags (e.g. excluded ranges, immature releases) */
  reject?: (tag: ParsedTag) => boolean
}

export interface SelectedTarget {
  /** the tag string to write (granularity matched to the current ref) */
  tag: string
  /** the underlying resolved tag (may be more specific than `tag`) */
  resolvedTag: string
}

/**
 * Pick the update target for a GitHub Action, honoring the range mode and
 * preserving the granularity of the current reference (`v4` -> `v5`,
 * `v4.1.1` -> `v4.2.0`).
 */
export function selectTarget(
  currentTag: string,
  tags: string[],
  mode: RangeMode,
  options: SelectTargetOptions = {},
): SelectedTarget | undefined {
  const selected = selectVersionTarget(currentTag, tags, mode, {
    reject: options.reject,
    requireExistingTarget: true,
    requireV: true,
  })
  if (!selected)
    return

  return {
    tag: selected.target,
    resolvedTag: selected.resolvedVersion,
  }
}

export async function fetchActionTags(repo: string, requestTimeout?: number): Promise<GitHubActionTags> {
  const shaMap: Record<string, string> = {}
  const parsed: ParsedTag[] = []

  try {
    for (let page = 1; page <= MAX_TAG_PAGES; page++) {
      const url = `${GITHUB_API}/repos/${repo}/tags?per_page=100&page=${page}`
      debug(`fetching ${url}`)
      const res = await ofetch(url, {
        headers: githubHeaders(),
        signal: requestTimeout ? AbortSignal.timeout(requestTimeout) : undefined,
      })

      if (!res.ok) {
        if (res.status === 404)
          return { versions: [], shaMap, error: '404' }
        const rateRemaining = res.headers.get('x-ratelimit-remaining')
        if (res.status === 403 && rateRemaining === '0')
          return { versions: [], shaMap, error: 'rate_limited' }
        return { versions: [], shaMap, error: `${res.status}` }
      }

      const data = await res.json() as { name: string, commit: { sha: string } }[]
      if (!Array.isArray(data) || data.length === 0)
        break

      for (const item of data) {
        const tag = parseVersionTag(item.name)
        if (!tag)
          continue
        parsed.push(tag)
        shaMap[item.name] = item.commit?.sha
      }

      if (data.length < 100)
        break
    }
  }
  catch (error: any) {
    return { versions: [], shaMap, error: error?.message || String(error) }
  }

  parsed.sort(compareVersionReferences)
  return {
    versions: parsed.map(t => t.raw),
    shaMap,
  }
}

export async function fetchCommitDate(repo: string, sha: string, requestTimeout?: number): Promise<string | undefined> {
  try {
    const url = `${GITHUB_API}/repos/${repo}/commits/${sha}`
    const res = await ofetch(url, {
      headers: githubHeaders(),
      signal: requestTimeout ? AbortSignal.timeout(requestTimeout) : undefined,
    })
    if (!res.ok)
      return undefined
    const data = await res.json() as { commit?: { committer?: { date?: string }, author?: { date?: string } } }
    return data.commit?.committer?.date || data.commit?.author?.date
  }
  catch {
    return undefined
  }
}
