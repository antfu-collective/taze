import c from 'picocolors'

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

  // major = red (or any change before 1.0.0)
  // minor = cyan
  // patch = green
  const color = (i === 0 || partsToColor[0] === '0')
    ? 'red'
    : i === 1
      ? 'cyan'
      : 'green'

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
