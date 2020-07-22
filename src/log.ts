import chalk from 'chalk'

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

    this.rows.forEach((line) => {
      if (typeof line === 'string')
        return
      for (let i = 0; i < columns; i++)
        columnsWidth[i] = Math.max(columnsWidth[i], stringLength(line[i] || ''))
    })

    this.rows.forEach((line) => {
      if (typeof line === 'string') {
        console.log(line)
        return
      }

      for (let i = 0; i < columns; i++) {
        const pad = align[i] === 'R' ? 'padStart' : 'padEnd'
        const part = line[i] || ''
        process.stdout.write(part[pad](columnsWidth[i] + pending - padDiff(part)))
      }
      process.stdout.write('\n')
    })
  }
}

export function colorizeDiff(from: string, to: string) {
  let leadingWildcard = ''

  // separate out leading ^ or ~
  if (/^[~^]/.test(to) && to[0] === from[0]) {
    leadingWildcard = to[0]
    to = to.slice(1)
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

  return chalk.grey(leadingWildcard)
        + partsToColor.slice(0, i).join('.')
        + middot
        + chalk[color](partsToColor.slice(i).join('.')).trim()
}

const padDiff = (str: string) => stringLength(str) - str.length

const ansiRegex = ({ onlyFirst = false } = {}) => {
  const pattern = [
    '[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:[a-zA-Z\\d]*(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)',
    '(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-ntqry=><~]))',
  ].join('|')

  return new RegExp(pattern, onlyFirst ? undefined : 'g')
}
const stripAnsi = (str: string) => typeof str === 'string' ? str.replace(ansiRegex(), '') : str
const stringLength = (str: string) => {
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
