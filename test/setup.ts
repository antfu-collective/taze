import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

const globalKey = '__tazeVitestTmpDir'
const globalState = globalThis as typeof globalThis & {
  [globalKey]?: string
}

if (!globalState[globalKey]) {
  globalState[globalKey] = fs.mkdtempSync(
    path.join(os.tmpdir(), `taze-vitest-${process.pid}-`),
  )

  process.on('exit', () => {
    fs.rmSync(globalState[globalKey]!, { recursive: true, force: true })
  })
}

process.env.TMPDIR = globalState[globalKey]
process.env.TMP = globalState[globalKey]
process.env.TEMP = globalState[globalKey]
