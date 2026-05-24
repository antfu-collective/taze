/* eslint-disable no-console */

import process from 'node:process'
import { stripVTControlCharacters } from 'node:util'
import c from 'ansis'
import { SemVer } from 'semver-es'
import { getDiff } from './io/resolves'

import { DiffColorMap } from './utils/diff'

export const FIG_CHECK = c.green('◉')
export const FIG_UNCHECK = c.gray('◌')
export const FIG_POINTER = c.cyan('❯ ')
export const FIG_NO_POINTER = '  '
export const FIG_BLOCK = c.bold.dim.gray('┃')

export function visualLength(str: string) {
  if (str === '')
    return 0

  str = stripVTControlCharacters(str)

  let width = 0

  for (let i = 0; i < str.length; i++) {
    const code = str.codePointAt(i)
    if (!code)
      continue

    // Ignore control characters
    if (code <= 0x1F || (code >= 0x7F && code <= 0x9F))
      continue

    // Ignore combining characters
    if (code >= 0x300 && code <= 0x36F)
      continue

    // Surrogates
    if (code > 0xFFFF)
      i++

    width += 1
  }

  return width
}

export function visualPadStart(str: string, pad: number, char = ' ') {
  return str.padStart(pad - visualLength(str) + str.length, char)
}

export function visualPadEnd(str: string, pad: number, char = ' ') {
  return str.padEnd(pad - visualLength(str) + str.length, char)
}

export function formatTable(lines: string[][], align: string, spaces = '  ') {
  const maxLen: number[] = []
  lines.forEach((line) => {
    line.forEach((char, i) => {
      const len = visualLength(char)
      if (!maxLen[i] || maxLen[i] < len)
        maxLen[i] = len
    })
  })

  return lines.map(line => line.map((chars, i) => {
    const pad = align[i] === 'R' ? visualPadStart : visualPadEnd
    return pad(chars, maxLen[i])
  }).join(spaces))
}

export function colorizeVersionDiff(from: string, to: string, hightlightRange = true) {
  let leadingWildcard = ''
  let fromLeadingWildcard = ''

  // separate out leading ^ or ~
  if (/^[~^]/.test(to)) {
    leadingWildcard = to[0]
    to = to.slice(1)
  }
  if (/^[~^]/.test(from)) {
    fromLeadingWildcard = from[0]
    from = from.slice(1)
  }

  // split into parts
  const partsToColor = to.split('.')
  const partsToCompare = from.split('.')

  let i = partsToColor.findIndex((part, i) => part !== partsToCompare[i])
  i = i >= 0 ? i : partsToColor.length

  let diffType = null
  try {
    diffType = getDiff(new SemVer(from), new SemVer(to))
  }
  catch {
  }
  const color = DiffColorMap[diffType || 'patch']

  // if we are colorizing only part of the word, add a dot in the middle
  const middot = (i > 0 && i < partsToColor.length) ? '.' : ''

  const leadingColor = (leadingWildcard === fromLeadingWildcard || !hightlightRange)
    ? 'gray'
    : 'yellow'

  return c[leadingColor](leadingWildcard)
    + partsToColor.slice(0, i).join('.')
    + middot
    + c[color](partsToColor.slice(i).join('.')).trim()
}

export interface SliceRenderLine {
  content: string
  fixed?: boolean
}

export function sliceRenderLines(
  lines: SliceRenderLine[],
  focusedLineIndex: number,
  remainHeight: number,
  availableWidth: number,
) {
  const hasWrappedLines = lines.some((line) => {
    const visualLineCount = Math.ceil(visualLength(line.content) / availableWidth)

    return visualLineCount > 1
  })

  if (
    remainHeight < 1
    || lines.length === 0
    || lines.length <= remainHeight
    || hasWrappedLines
  ) {
    return lines
  }

  const half = Math.floor((remainHeight - 1) / 2)
  const startOffset = focusedLineIndex - half
  const endOffset = focusedLineIndex + remainHeight - half - lines.length
  const compensatedStartOffset = endOffset <= 0 ? startOffset : startOffset - endOffset
  const start = Math.max(0, compensatedStartOffset)

  return lines.slice(start, start + remainHeight)
}

export function createSliceRender() {
  const buffer: SliceRenderLine[] = []

  return {
    push(...lines: SliceRenderLine[]) {
      buffer.push(...lines)
    },
    render(selectedDepIndex: number) {
      let {
        rows: remainHeight,
        columns: availableWidth,
      } = process.stdout

      const lines: SliceRenderLine[] = buffer.length < remainHeight - 1
        ? buffer
        : [...buffer, { content: c.yellow('  -- END --') }]

      // spare space for cursor
      remainHeight -= 1
      let i = 0
      while (i < lines.length) {
        const curr = lines[i]
        if (curr.fixed) {
          console.log(curr.content)
          remainHeight -= 1
          i++
        }
        else {
          break
        }
      }

      const remainLines = lines.slice(i)

      // calculate focused line index from selected dep index
      let focusedLineIndex = 0
      let depIndex = 0
      for (const line of remainLines) {
        if (line.content.includes(FIG_CHECK) || line.content.includes(FIG_UNCHECK))
          depIndex += 1

        if (depIndex === selectedDepIndex)
          break

        focusedLineIndex += 1
      }

      const slice = sliceRenderLines(remainLines, focusedLineIndex, remainHeight, availableWidth)

      console.log(slice.map(x => x.content).join('\n'))
    },
  }
}

export function colorizeNodeCompatibility(nodeVersionCompatibility?: { semver: string, compatible: boolean }) {
  if (!nodeVersionCompatibility)
    return ''

  return nodeVersionCompatibility.compatible
    ? c.dim(nodeVersionCompatibility.semver)
    : c.red(nodeVersionCompatibility.semver)
}
