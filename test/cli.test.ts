import { resolve } from 'pathe'
import { exec } from 'tinyexec'
import { expect, it } from 'vitest'

it('taze cli should just works', async () => {
  const binPath = resolve(__dirname, '../bin/taze.mjs')

  const proc = await exec(process.execPath, [binPath, '--help'], { throwOnError: false })

  expect(proc.stderr).toBe('')
  expect(proc.exitCode).toBe(0)
})

it('taze cli should accept --concurrency option', async () => {
  const binPath = resolve(__dirname, '../bin/taze.mjs')

  const proc = await exec(process.execPath, [binPath, '--help', '--concurrency', '5'], { throwOnError: false })

  expect(proc.stderr).toBe('')
  expect(proc.exitCode).toBe(0)
})

it('taze cli should accept --request-timeout option', async () => {
  const binPath = resolve(__dirname, '../bin/taze.mjs')

  const proc = await exec(process.execPath, [binPath, '--request-timeout', '15000'], { throwOnError: false })

  expect(proc.stderr).toBe('')
  expect(proc.exitCode).toBe(0)
})
