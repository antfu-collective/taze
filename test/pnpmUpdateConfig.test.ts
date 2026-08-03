import type { CheckOptions, CommonOptions } from '../src'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { resolveConfig } from '../src/config'
import { detectPnpmUpdateIgnores } from '../src/utils/detectMaturity'

const tmpRoots: string[] = []

function makeTmp(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'taze-updateconfig-'))
  tmpRoots.push(dir)
  return dir
}

function write(dir: string, relpath: string, content: string) {
  const full = path.join(dir, relpath)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, content, 'utf-8')
}

afterAll(() => {
  for (const dir of tmpRoots)
    fs.rmSync(dir, { recursive: true, force: true })
})

describe('detectPnpmUpdateIgnores', () => {
  let cwd: string

  beforeEach(() => {
    cwd = makeTmp()
  })

  it('reads updateConfig.ignoreDependencies (pnpm 10.x)', async () => {
    write(cwd, 'pnpm-workspace.yaml', 'updateConfig:\n  ignoreDependencies:\n    - load-json-file\n    - "@babel/*"\n')
    expect(await detectPnpmUpdateIgnores(cwd)).toEqual(['load-json-file', '@babel/*'])
  })

  it('reads update.ignoreDeps (pnpm 11 & 12)', async () => {
    write(cwd, 'pnpm-workspace.yaml', 'update:\n  ignoreDeps:\n    - react\n    - react-dom\n')
    expect(await detectPnpmUpdateIgnores(cwd)).toEqual(['react', 'react-dom'])
  })

  it('unions and dedupes both keys', async () => {
    write(cwd, 'pnpm-workspace.yaml', 'updateConfig:\n  ignoreDependencies:\n    - react\n    - vue\nupdate:\n  ignoreDeps:\n    - vue\n    - svelte\n')
    expect(await detectPnpmUpdateIgnores(cwd)).toEqual(['react', 'vue', 'svelte'])
  })

  it('returns [] when the yaml exists without the fields', async () => {
    write(cwd, 'pnpm-workspace.yaml', 'packages:\n  - "packages/*"\n')
    expect(await detectPnpmUpdateIgnores(cwd)).toEqual([])
  })

  it('returns [] when no pnpm-workspace.yaml exists', async () => {
    expect(await detectPnpmUpdateIgnores(cwd)).toEqual([])
  })

  it('ignores non-string junk entries', async () => {
    write(cwd, 'pnpm-workspace.yaml', 'updateConfig:\n  ignoreDependencies:\n    - react\n    - 123\n    - true\n')
    expect(await detectPnpmUpdateIgnores(cwd)).toEqual(['react'])
  })

  it('finds pnpm-workspace.yaml above cwd', async () => {
    write(cwd, 'pnpm-workspace.yaml', 'updateConfig:\n  ignoreDependencies:\n    - react\n')
    const deep = path.join(cwd, 'packages', 'foo', 'src')
    fs.mkdirSync(deep, { recursive: true })
    expect(await detectPnpmUpdateIgnores(deep)).toEqual(['react'])
  })
})

describe('resolveConfig folds pnpm update ignores into exclude', () => {
  let cwd: string

  beforeEach(() => {
    cwd = makeTmp()
  })

  it('adds pnpm ignores to exclude', async () => {
    write(cwd, 'pnpm-workspace.yaml', 'updateConfig:\n  ignoreDependencies:\n    - react\n    - "@babel/*"\n')
    const options: CommonOptions = { cwd, loglevel: 'silent' }
    const { exclude } = await resolveConfig(options)
    expect(exclude).toEqual(['react', '@babel/*'])
  })

  it('unions with a user-provided exclude (additive, deduped)', async () => {
    write(cwd, 'pnpm-workspace.yaml', 'updateConfig:\n  ignoreDependencies:\n    - react\n    - vue\n')
    const options: CommonOptions = { cwd, loglevel: 'silent', exclude: ['vue', 'lodash'] }
    const { exclude } = await resolveConfig(options)
    expect(exclude).toEqual(['vue', 'lodash', 'react'])
  })

  it('does not apply in global mode', async () => {
    write(cwd, 'pnpm-workspace.yaml', 'updateConfig:\n  ignoreDependencies:\n    - react\n')
    const options: CheckOptions = { cwd, loglevel: 'silent', global: true }
    const { exclude } = await resolveConfig(options)
    expect(exclude).toEqual([])
  })

  it('leaves exclude untouched when there are no pnpm ignores', async () => {
    write(cwd, 'pnpm-workspace.yaml', 'packages:\n  - "packages/*"\n')
    const options: CommonOptions = { cwd, loglevel: 'silent' }
    const { exclude } = await resolveConfig(options)
    expect(exclude).toEqual([])
  })
})
