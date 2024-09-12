import path from 'node:path'
import { exec } from 'tinyexec'
import { expect, it } from 'vitest'

it('taze cli should just works', async () => {
  const binPath = path.resolve(__dirname, '../bin/taze.mjs')

  const proc = await exec(process.execPath, [binPath], { throwOnError: true })

  expect(proc.stderr).toBe('')
})
