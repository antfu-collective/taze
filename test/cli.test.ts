import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { resolve } from 'pathe'
import { exec } from 'tinyexec'
import { expect, it } from 'vitest'

const binPath = resolve(__dirname, '../bin/taze.mjs')

async function runInFixture(files: Record<string, string>, args: string[] = []) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'taze-cli-test-'))
  try {
    for (const [name, content] of Object.entries(files))
      fs.writeFileSync(path.join(tmp, name), content)
    return await exec(process.execPath, [binPath, ...args], { nodeOptions: { cwd: tmp } })
  }
  finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

const nodeVersionFixture = {
  'package.json': JSON.stringify({ name: 'test-pkg', version: '1.0.0' }),
  '.node-version': '18.0.0\n',
  'taze.config.json': JSON.stringify({ nodeVersion: false }),
}

it('respects nodeVersion: false in config file', async () => {
  const proc = await runInFixture(nodeVersionFixture)
  expect(proc.stdout).not.toContain('.node-version')
  expect(proc.exitCode).toBe(0)
})

it('allows --node-version CLI flag to override nodeVersion: false in config', async () => {
  const proc = await runInFixture(nodeVersionFixture, ['--node-version'])
  expect(proc.stdout).toContain('.node-version')
  expect(proc.exitCode).toBe(0)
})

it('taze cli should expose options that require values', async () => {
  const proc = await exec(process.execPath, [binPath, '--help'], { throwOnError: false })

  expect(proc.stdout).toContain('--concurrency <requests>')
  expect(proc.stdout).toContain('--request-timeout <ms>')
  expect(proc.stdout).toContain('--no-node-version')
  expect(proc.stderr).toBe('')
  expect(proc.exitCode).toBe(0)
})

it('taze cli should expose --fast-npm-meta-api-endpoint option', async () => {
  const proc = await exec(process.execPath, [binPath, '--help'], { throwOnError: false })

  expect(proc.stdout).toContain('--fast-npm-meta-api-endpoint <url>')
  expect(proc.exitCode).toBe(0)
})
