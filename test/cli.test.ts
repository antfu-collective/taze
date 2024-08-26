import path from 'node:path'
import { expect, it } from 'vitest'
import { exec } from 'tinyexec'

it('taze cli should just works', async () => {
  const binPath = path.resolve(__dirname, '../bin/taze.mjs')

  const proc = await exec(process.execPath, [binPath], { throwOnError: true })

  expect(proc.stderr).toBe('')
})
