import { resolve } from 'pathe'
import { exec } from 'tinyexec'
import { expect, it } from 'vitest'

it('taze cli should just works', async () => {
  const binPath = resolve(__dirname, '../bin/taze.mjs')

  const proc = await exec(process.execPath, [binPath], { throwOnError: false })

  expect(proc.stderr).toBe('')
  expect(proc.exitCode).toBe(0)
})
