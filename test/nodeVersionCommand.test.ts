import type { PackageMeta } from '../src/types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { check } from '../src/commands/check'

const {
  checkPackagesMock,
  detectMock,
  promptInteractiveMock,
  promptsMock,
  runMock,
  writePackageMock,
} = vi.hoisted(() => ({
  checkPackagesMock: vi.fn(),
  detectMock: vi.fn(),
  promptInteractiveMock: vi.fn(),
  promptsMock: vi.fn(),
  runMock: vi.fn(),
  writePackageMock: vi.fn(),
}))

vi.mock('@antfu/ni', () => ({
  detect: detectMock,
  parseNi: vi.fn(),
  parseNup: vi.fn(),
  run: runMock,
}))

vi.mock('@posva/prompts', () => ({
  default: promptsMock,
}))

vi.mock('../src/api/check', () => ({
  CheckPackages: checkPackagesMock,
}))

vi.mock('../src/commands/check/interactive', () => ({
  promptInteractive: promptInteractiveMock,
}))

vi.mock('../src/io/packages', () => ({
  writePackage: writePackageMock,
}))

function createNodeVersionPackage(): PackageMeta {
  return {
    deps: [],
    filepath: '/tmp/project/.node-version',
    name: '.node-version',
    private: false,
    raw: { leading: '', trailing: '\n' },
    relative: '.node-version',
    resolved: [{
      currentVersion: '22',
      diff: 'major',
      name: 'node',
      pkgData: { tags: { latest: 'v26.1.0' }, versions: ['v26.1.0'] },
      provenanceDowngraded: false,
      source: 'node-version',
      targetVersion: '26',
      update: true,
    }],
    type: 'node-version',
    version: '22',
  }
}

beforeEach(() => {
  const packages = [createNodeVersionPackage()]
  checkPackagesMock.mockResolvedValue({ packages })
  promptInteractiveMock.mockResolvedValue(packages)
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  checkPackagesMock.mockReset()
  detectMock.mockReset()
  promptInteractiveMock.mockReset()
  promptsMock.mockReset()
  runMock.mockReset()
  writePackageMock.mockReset()
})

describe('node-version install behavior', () => {
  it('does not print package-manager advice after a non-interactive node-only write', async () => {
    await check({ loglevel: 'silent', mode: 'major', write: true })

    expect(detectMock).not.toHaveBeenCalled()
    expect(runMock).not.toHaveBeenCalled()
    expect(writePackageMock).toHaveBeenCalledOnce()
  })

  it('does not offer a package-manager install after an interactive node-only write', async () => {
    await check({ interactive: true, loglevel: 'silent', mode: 'major', write: true })

    expect(promptsMock).not.toHaveBeenCalled()
    expect(detectMock).not.toHaveBeenCalled()
    expect(runMock).not.toHaveBeenCalled()
    expect(writePackageMock).toHaveBeenCalledOnce()
  })

  it('keeps explicit install behavior for a node-only write', async () => {
    await check({ install: true, loglevel: 'silent', mode: 'major', write: true })

    expect(runMock).toHaveBeenCalledOnce()
  })
})
