import semver from 'semver'
import type { RangeMode } from '../types'

export function getVersionRangePrefix(v: string) {
  const leadings = ['>=', '<=', '>', '<', '~', '^']
  const ver = v.trim()

  if (ver === '*' || ver === '')
    return '*'
  if (ver[0] === '~' || ver[0] === '^')
    return ver[0]
  for (const leading of leadings) {
    if (ver.startsWith(leading))
      return leading
  }
  if (ver.includes('x')) {
    const parts = ver.split('.')
    if (parts[0] === 'x')
      return '*'
    if (parts[1] === 'x')
      return '^'
    if (parts[2] === 'x')
      return '~'
  }
  if (+ver[0] < 10)
    return ''
  return null
}

export function changeVersionRange(version: string, mode: Exclude<RangeMode, 'latest'|'newest'>) {
  if (!semver.validRange(version))
    return null

  if (mode === 'default')
    return version

  const min = semver.minVersion(version)
  if (!min)
    return null

  return {
    major: '>=',
    minor: '^',
    patch: '~',
  }[mode] + min
}

export function applyVersionRangePrefix(version: string | null, prefix: string | null) {
  if (version == null || prefix == null)
    return null

  if (prefix === '*')
    return '*'

  return prefix + version
}

export function getMaxSatisfying(versions: string[], current: string, mode: RangeMode, tags: Record<string, string>) {
  const prefix = getVersionRangePrefix(current)
  let version = null

  if (mode === 'latest') {
    version = tags.latest
  }
  else if (mode === 'newest') {
    version = tags.next
  }
  else if (mode === 'default' && (current === '*' || current.trim() === '')) {
    return null
  }
  else {
    const range = changeVersionRange(current, mode)
    if (!range)
      throw new Error('invalid_range')

    version = semver.maxSatisfying(versions, range)
  }

  if (!version)
    return null

  return {
    version,
    prefix,
    prefixed: applyVersionRangePrefix(
      version,
      prefix,
    ),
  }
}
