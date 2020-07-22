export async function columnLog(columns: number, fn: (log: (...args: string[]) => void) => void, pending = 2) {
  const lines: string[][] = []

  const log = (...args: string[]) => {
    lines.push(args)
  }

  await Promise.resolve(fn(log))

  const columnsWidth = new Array(columns).fill(0)

  lines.forEach((line) => {
    for (let i = 0; i < columns; i++)
      columnsWidth[i] = Math.max(columnsWidth[i], (line[i] || '').length)
  })

  lines.forEach((line) => {
    for (let i = 0; i < columns; i++)
      process.stdout.write((line[i] || '').padEnd(columnsWidth[i] + pending))
    process.stdout.write('\n')
  })
}
