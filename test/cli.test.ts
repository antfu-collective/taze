import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { resolve } from 'pathe'
import { exec } from 'tinyexec'
import { expect, it } from 'vitest'

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

it('respects nodeVersion: false in config file', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'taze-cli-test-'))
  try {
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ name: 'test-pkg', version: '1.0.0' }))
    fs.writeFileSync(path.join(tmp, '.node-version'), '18.0.0\n')
    fs.writeFileSync(path.join(tmp, 'taze.config.json'), JSON.stringify({ nodeVersion: false }))

    const binPath = resolve(__dirname, '../bin/taze.mjs')
    const proc = await exec(process.execPath, [binPath], { nodeOptions: { cwd: tmp } })
    expect(proc.stdout).not.toContain('.node-version')
    expect(proc.exitCode).toBe(0)
  }
  finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
})

it('allows --node-version CLI flag to override nodeVersion: false in config', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'taze-cli-test-'))
  try {
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ name: 'test-pkg', version: '1.0.0' }))
    fs.writeFileSync(path.join(tmp, '.node-version'), '18.0.0\n')
    fs.writeFileSync(path.join(tmp, 'taze.config.json'), JSON.stringify({ nodeVersion: false }))

    const binPath = resolve(__dirname, '../bin/taze.mjs')
    const proc = await exec(process.execPath, [binPath, '--node-version'], { nodeOptions: { cwd: tmp } })
    expect(proc.stdout).toContain('.node-version')
    expect(proc.exitCode).toBe(0)
  }
  finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
})
