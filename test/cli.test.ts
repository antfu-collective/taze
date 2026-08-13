import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { resolve } from 'pathe'
import { exec } from 'tinyexec'
import { afterEach, expect, it } from 'vitest'

const tempDirs: string[] = []

afterEach(() => {
  for (const tempDir of tempDirs.splice(0))
    fs.rmSync(tempDir, { recursive: true, force: true })
})

it('taze cli should expose options that require values', async () => {
  const binPath = resolve(__dirname, '../bin/taze.mjs')
  const proc = await exec(process.execPath, [binPath, '--help'], { throwOnError: false })

  expect(proc.stdout).toContain('--concurrency <requests>')
  expect(proc.stdout).toContain('--request-timeout <ms>')
  expect(proc.stdout).toContain('--no-node-version')
  expect(proc.stderr).toBe('')
  expect(proc.exitCode).toBe(0)
})

it('taze cli should expose --fast-npm-meta-api-endpoint option', async () => {
  const binPath = resolve(__dirname, '../bin/taze.mjs')

  const proc = await exec(process.execPath, [binPath, '--help'], { throwOnError: false })

  expect(proc.stdout).toContain('--fast-npm-meta-api-endpoint <url>')
  expect(proc.exitCode).toBe(0)
})

it('taze cli should preserve nodeVersion false from config when the flag is absent', async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'taze-cli-node-version-'))
  tempDirs.push(cwd)
  fs.writeFileSync(path.join(cwd, '.tazerc'), JSON.stringify({ nodeVersion: false }))
  const nodeVersionFile = path.join(cwd, '.node-version')
  fs.writeFileSync(nodeVersionFile, '22.14.0\n')
  fs.chmodSync(nodeVersionFile, 0)
  const binPath = resolve(__dirname, '../bin/taze.mjs')

  const proc = await exec(process.execPath, [binPath, 'major', '--cwd', cwd, '--loglevel', 'silent'], { throwOnError: false })

  expect(proc.stderr).toBe('')
  expect(proc.exitCode).toBe(0)
})
