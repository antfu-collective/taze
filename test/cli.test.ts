import { resolve } from 'pathe'
import { exec } from 'tinyexec'
import { expect, it } from 'vitest'

it('taze cli should expose options that require values', async () => {
  const binPath = resolve(__dirname, '../bin/taze.mjs')
  const proc = await exec(process.execPath, [binPath, '--help'], { throwOnError: false })

  expect(proc.stdout).toContain('--concurrency <requests>')
  expect(proc.stdout).toContain('--request-timeout <ms>')
  expect(proc.stderr).toBe('')
  expect(proc.exitCode).toBe(0)
})
