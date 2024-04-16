import path from 'node:path'
import { expect, it } from 'vitest'
import { execa } from 'execa'

it('taze cli should just works', async () => {
  const binPath = path.resolve(__dirname, '../bin/taze.mjs')

  const proc = await execa(process.execPath, [binPath], { stdio: 'pipe' })

  expect(proc.stderr).toBe('')
})
