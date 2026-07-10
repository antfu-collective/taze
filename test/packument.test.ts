import type { PackageVersionsInfoWithMetadata } from 'get-npm-meta'
import { afterEach, expect, it, vi } from 'vitest'
import { fetchPackage } from '../src/utils/packument'

const { getVersionsMock } = vi.hoisted(() => ({
  getVersionsMock: vi.fn(),
}))

vi.mock('get-npm-meta', () => ({
  getVersions: getVersionsMock,
}))

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

it('allows slow package metadata requests to complete without leaving a timeout pending', async () => {
  vi.useFakeTimers()

  const packageInfo: PackageVersionsInfoWithMetadata = {
    name: 'slow-package',
    distTags: { latest: '1.0.0' },
    versionsMeta: { '1.0.0': {} },
    timeCreated: '2026-01-01T00:00:00.000Z',
    timeModified: '2026-01-01T00:00:00.000Z',
    lastSynced: Date.now(),
    specifier: '*',
  }

  getVersionsMock.mockImplementation(() => new Promise((resolve) => {
    setTimeout(() => resolve(packageInfo), 10_000)
  }))

  const result = fetchPackage('slow-package')
  const assertion = expect(result).resolves.toMatchObject({
    tags: { latest: '1.0.0' },
    versions: ['1.0.0'],
  })

  await Promise.all([
    assertion,
    vi.advanceTimersByTimeAsync(10_000),
  ])

  expect(vi.getTimerCount()).toBe(0)
})
