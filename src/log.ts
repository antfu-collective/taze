import process from 'node:process'
import c from 'picocolors'
import { MultiBar, Presets } from 'cli-progress'
import { LOG_LEVELS } from './constants'
import { visualLength, visualPadEnd, visualPadStart } from './render'
import type { LogLevel } from './types'

interface Options {
  columns: number
  pending: number
  align: string
  loglevel: LogLevel
}

export function shouldLog(level: LogLevel, messageLevel: LogLevel) {
  return LOG_LEVELS.indexOf(level) <= LOG_LEVELS.indexOf(messageLevel)
}

export class TableLogger {
  private options: Options
  private rows: (string[] | string)[] = []

  constructor(options: Partial<Options> = {}) {
    const {
      columns = 3,
      pending = 2,
      align = '',
      loglevel = 'error',
    } = options
    this.options = {
      columns,
      pending,
      align,
      loglevel,
    }
  }

  row(...args: string[]) {
    this.rows.push(args)
  }

  log(string = '') {
    this.rows.push(string)
  }

  error(string = '') {
    if (shouldLog(this.options.loglevel, 'error'))
      this.rows.push(string)
  }

  warn(string = '') {
    if (shouldLog(this.options.loglevel, 'warn'))
      this.rows.push(string)
  }

  debug(string = '') {
    if (shouldLog(this.options.loglevel, 'debug'))
      this.rows.push(string)
  }

  output() {
    if (this.options.loglevel === 'silent')
      return

    const { columns, align, pending } = this.options
    const columnsWidth = Array.from({ length: columns }, () => 0)

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
        process.stdout.write(`${line}\n`)
        return
      }

      for (let i = 0; i < columns; i++) {
        const pad = align[i] === 'R' ? visualPadStart : visualPadEnd
        const part = line[i] || ''
        process.stdout.write(pad(part, columnsWidth[i] + pending))
      }
      process.stdout.write('\n')
    })

    // clear rows for next use
    this.rows = []
  }
}

export function createMultiProgressBar() {
  return new MultiBar({
    clearOnComplete: true,
    hideCursor: true,
    format: `{type} {bar} {value}/{total} ${c.gray('{name}')}`,
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
