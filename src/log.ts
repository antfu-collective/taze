import chalk from 'chalk'
import { MultiBar, Presets } from 'cli-progress'

interface Options {
  columns: number
  pending: number
  align: string
}

export class TableLogger {
  private options: Options
  private rows: (string[] | string)[] = []

  constructor(options: Partial<Options> = {}) {
    const {
      columns = 3,
      pending = 2,
      align = '',
    } = options
    this.options = {
      columns,
      pending,
      align,
    }
  }

  row(...args: string[]) {
    this.rows.push(args)
  }

  log(string = '') {
    this.rows.push(string)
  }

  output() {
    const { columns, align, pending } = this.options
    const columnsWidth = new Array(columns).fill(0)

    // calc the max width of columns
    this.rows.forEach((line) => {
      if (typeof line === 'string')
        return
      for (let i = 0; i < columns; i++)
        columnsWidth[i] = Math.max(columnsWidth[i], visualLength(line[i] || ''))
    })

    // print
    this.rows.forEach((line) => {
      if (typeof line === 'string') {
        console.log(line)
        return
      }

      for (let i = 0; i < columns; i++) {
        const pad = align[i] === 'R' ? visualPadStart : visualPadEnd
        const part = line[i] || ''
        process.stdout.write(pad(part, columnsWidth[i] + pending))
      }
      process.stdout.write('\n')
    })
  }
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
  const color = i === 0 || partsToColor[0] === '0' ? 'red'
    : i === 1 ? 'cyan'
      : 'green'

  // if we are colorizing only part of the word, add a dot in the middle
  const middot = i > 0 && i < partsToColor.length ? '.' : ''

  const leadingColor = (leadingWildcard === fromLeadingWildcard || !hightlightRange)
    ? 'grey'
    : 'yellow'

  return chalk[leadingColor](leadingWildcard)
        + partsToColor.slice(0, i).join('.')
        + middot
        + chalk[color](partsToColor.slice(i).join('.')).trim()
}

export function createMultiProgresBar() {
  return new MultiBar({
    clearOnComplete: true,
    hideCursor: true,
    format: `{type} {bar} {value}/{total} ${chalk.gray('{name}')}`,
    linewrap: false,
    barsize: 40,
  }, Presets.shades_grey)
}

export function wrapJoin(strs: string[], delimiter: string, width: number): string[] {
  const lines: string[] = []
  let line = ''
  for (let i = 0; i < strs.length; i++) {
    const str = strs[i]
    if (line && visualLength(line + str) > width) {
      lines.push(line)
      line = ''
    }
    line += str
    if (i < strs.length - 1)
      line += delimiter
  }
  lines.push(line)
  return lines
}

const ansiRegex = ({ onlyFirst = false } = {}) => {
  const pattern = [
    '[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:[a-zA-Z\\d]*(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)',
    '(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-ntqry=><~]))',
  ].join('|')

  return new RegExp(pattern, onlyFirst ? undefined : 'g')
}
const stripAnsi = (str: string) => typeof str === 'string' ? str.replace(ansiRegex(), '') : str
export const visualLength = (str: string) => {
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

export const visualPadStart = (str: string, pad: number, char = ' ') => {
  return str.padStart(pad - visualLength(str) + str.length, char)
}

export const visualPadEnd = (str: string, pad: number, char = ' ') => {
  return str.padEnd(pad - visualLength(str) + str.length, char)
}
