import process from 'node:process'
import c from 'picocolors'
import { SemVer } from 'semver'
import { getDiff } from './io/resolves'
import { DiffColorMap } from './utils/diff'

export const FIG_CHECK = c.green('◉')
export const FIG_UNCHECK = c.gray('◌')
export const FIG_POINTER = c.cyan('❯ ')
export const FIG_NO_POINTER = '  '
export const FIG_BLOCK = c.bold(c.dim(c.gray('┃')))

function ansiRegex({ onlyFirst = false } = {}) {
  const pattern = [
    '[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:[a-zA-Z\\d]*(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)',
    '(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-ntqry=><~]))',
  ].join('|')

  return new RegExp(pattern, onlyFirst ? undefined : 'g')
}
const stripAnsi = (str: string) => typeof str === 'string' ? str.replace(ansiRegex(), '') : str

export function visualLength(str: string) {
  if (str === '')
    return 0

  str = stripAnsi(str)

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

  const diffType = getDiff(new SemVer(from), new SemVer(to))
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

interface SliceRenderLine {
  content: string
  rows: number
  fixed: boolean
}

export function createSliceRender() {
  const { columns } = process.stdout
  const all: SliceRenderLine[] = []
  return {
    push(...lines: { content: string; fixed?: boolean }[]) {
      for (const line of lines) {
        all.push({
          ...line,
          rows: Math.ceil(visualLength(line.content) / columns) || 1,
          fixed: line.fixed ?? false,
        })
      }
    },
    render(selectedDepIndex: number) {
      let { rows: remainHeight } = process.stdout
      // spare space for cursor
      remainHeight -= 1
      let i = 0
      while (i < all.length) {
        const curr = all[i]
        if (curr.fixed) {
          /* eslint-disable-next-line no-console */
          console.log(curr.content)
          remainHeight -= curr.rows
          i++
        }
        else {
          break
        }
      }
      const remainLines = all.slice(i)

      // calculate focused line index from selected dep index
      let focusedLineIndex = 0
      let depIndex = 0
      for (const line of remainLines) {
        if (line.content.includes(FIG_CHECK))
          depIndex++

        if (depIndex === selectedDepIndex)
          break
        else
          focusedLineIndex += line.rows
      }

      let slice: SliceRenderLine[]
      if (remainHeight < 1 || remainLines.length === 0 || remainLines.length <= remainHeight) {
        slice = remainLines
      }
      else {
        const half = Math.floor((remainHeight - 1) / 2)
        const f = focusedLineIndex - half
        const b = focusedLineIndex + remainHeight - half - remainLines.length
        const start = Math.max(0, b <= 0 ? f : f - b)
        slice = remainLines.slice(start, start + remainHeight)
      }
      /* eslint-disable-next-line no-console */
      console.log(slice.map(x => x.content).join('\n'))
    },
  }
}
