/* eslint-disable no-console */

import process from 'node:process'
import readline from 'node:readline'
import { stripVTControlCharacters } from 'node:util'
import c from 'ansis'
import { getDiff } from './registries'

import { DiffColorMap } from './utils/diff'

export const FIG_CHECK = c.green('◉')
export const FIG_UNCHECK = c.gray('◌')
export const FIG_POINTER = c.cyan('❯ ')
export const FIG_NO_POINTER = '  '
export const FIG_BLOCK = c.bold.dim.gray('┃')
const ERASE_LINE_SUFFIX = '\u001B[K'
const HIDE_CURSOR_SEQUENCE = '\u001B[?25l'
const SHOW_CURSOR_SEQUENCE = '\u001B[?25h'

function visualLength(str: string) {
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

function visualPadStart(str: string, pad: number, char = ' ') {
  return str.padStart(pad - visualLength(str) + str.length, char)
}

function visualPadEnd(str: string, pad: number, char = ' ') {
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
    diffType = getDiff(from, to)
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

export function clearInteractiveScreen() {
  if (process.stdout.isTTY) {
    readline.cursorTo(process.stdout, 0, 0)
    readline.clearScreenDown(process.stdout)

    return
  }

  console.clear()
}

export function hideInteractiveCursor() {
  const hasTtyOutput = process.stdout.isTTY

  if (!hasTtyOutput)
    return

  process.stdout.write(HIDE_CURSOR_SEQUENCE)
}

export function showInteractiveCursor() {
  const hasTtyOutput = process.stdout.isTTY

  if (!hasTtyOutput)
    return

  process.stdout.write(SHOW_CURSOR_SEQUENCE)
}

export function writeInteractiveScreen(lines: string[]) {
  const output = lines.join('\n')
  const hasTtyOutput = process.stdout.isTTY

  if (!hasTtyOutput) {
    clearInteractiveScreen()

    if (output === '')
      return

    process.stdout.write(`${output}\n`)

    return
  }

  readline.cursorTo(process.stdout, 0, 0)

  if (output !== '') {
    const outputLines = lines.map(line => `${line}${ERASE_LINE_SUFFIX}`)
    const ttyOutput = outputLines.join('\n')

    process.stdout.write(`${ttyOutput}\n`)
  }

  readline.clearScreenDown(process.stdout)
}

export interface SliceRenderLine {
  content: string
  fixed?: boolean
}

function getVisualLineCount(content: string, width: number) {
  return content.split('\n').reduce((rows, line) => rows + Math.max(1, Math.ceil(visualLength(line) / width)), 0)
}

export function sliceRenderLines(
  lines: SliceRenderLine[],
  focusedLineIndex: number,
  remainHeight: number,
  availableWidth: number,
) {
  if (!lines.length || remainHeight < 1)
    return []

  const heights = lines.map(line => getVisualLineCount(line.content, availableWidth))
  let start = focusedLineIndex
  let end = start + 1
  let remaining = remainHeight - heights[start]

  if (remaining < 0)
    return [lines[start]]

  let above = Math.floor(remaining / 2)
  while (start > 0 && heights[start - 1] <= above) {
    const height = heights[--start]
    above -= height
    remaining -= height
  }
  while (end < lines.length && heights[end] <= remaining)
    remaining -= heights[end++]
  while (start > 0 && heights[start - 1] <= remaining)
    remaining -= heights[--start]

  return lines.slice(start, end)
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
      const outputLines: string[] = []

      const lines: SliceRenderLine[] = buffer.length < remainHeight - 1
        ? buffer
        : [...buffer, { content: c.yellow('  -- END --') }]

      // spare space for cursor
      remainHeight -= 1
      let i = 0
      while (i < lines.length) {
        const curr = lines[i]
        if (curr.fixed) {
          outputLines.push(curr.content)
          remainHeight -= getVisualLineCount(curr.content, availableWidth)
          i++
        }
        else {
          break
        }
      }

      // hide the header if it leaves no room for the list
      if (remainHeight < 1) {
        outputLines.length = 0
        remainHeight = process.stdout.rows - 1
      }

      const remainLines = lines.slice(i)

      // calculate focused line index from selected dep index
      let focusedLineIndex = 0
      let depIndex = 0
      for (const line of remainLines) {
        if (line.content.includes(FIG_CHECK) || line.content.includes(FIG_UNCHECK)) {
          if (depIndex === selectedDepIndex)
            break
          depIndex += 1
        }

        focusedLineIndex += 1
      }

      const slice = sliceRenderLines(remainLines, focusedLineIndex, remainHeight, availableWidth)

      outputLines.push(...slice.map(line => line.content))

      writeInteractiveScreen(outputLines)
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
