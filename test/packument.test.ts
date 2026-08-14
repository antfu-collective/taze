import { afterEach, expect, it, vi } from 'vitest'
import { resolveDependency } from '../src/registries'
import { fetchPackage } from '../src/utils/packument'

const { getVersionsMock, ofetchMock } = vi.hoisted(() => ({
  getVersionsMock: vi.fn(),
  ofetchMock: vi.fn(),
}))

vi.mock('get-npm-meta', () => ({
  getVersions: getVersionsMock,
}))

vi.mock('ofetch', () => ({
  fetch: ofetchMock,
}))

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
  getVersionsMock.mockReset()
  ofetchMock.mockReset()
})

it('aborts npm metadata requests when timeout is exceeded', async () => {
  vi.useFakeTimers()

  let aborted = false

  ofetchMock.mockImplementation((_input, init) => new Promise((_, reject) => {
    const signal = init?.signal as AbortSignal | undefined

    signal?.addEventListener('abort', () => {
      aborted = true
      reject(new DOMException('Aborted', 'AbortError'))
    })
  }))

  getVersionsMock.mockImplementation((_spec, options) => options.fetch('https://registry.npmjs.org/drizzle-orm'))

  const promise = fetchPackage('drizzle-orm', false, undefined, 25)
  const rejection = expect(promise).rejects.toThrow('Timeout requesting "drizzle-orm"')

  await vi.advanceTimersByTimeAsync(25)

  await rejection
  expect(aborted).toBe(true)
})

it('times out promptly even when upstream ignores abort settlement', async () => {
  vi.useFakeTimers()

  let aborted = false

  ofetchMock.mockImplementation((_input, init) => new Promise(() => {
    const signal = init?.signal as AbortSignal | undefined

    signal?.addEventListener('abort', () => {
      aborted = true
    })
  }))

  getVersionsMock.mockImplementation((_spec, options) => {
    options.fetch('https://registry.npmjs.org/drizzle-orm')
    return new Promise(() => {})
  })

  const promise = fetchPackage('drizzle-orm', false, undefined, 25)
  const rejection = expect(promise).rejects.toThrow('Timeout requesting "drizzle-orm"')

  await vi.advanceTimersByTimeAsync(25)

  await rejection
  expect(aborted).toBe(true)
})

it('clears the timeout after a successful request', async () => {
  vi.useFakeTimers()

  getVersionsMock.mockResolvedValue({
    distTags: { latest: '1.0.0' },
    timeCreated: '2024-01-01T00:00:00.000Z',
    timeModified: '2024-01-01T00:00:00.000Z',
    versionsMeta: {
      '1.0.0': {},
    },
  })

  await expect(fetchPackage('drizzle-orm', false, undefined, 25)).resolves.toMatchObject({
    tags: { latest: '1.0.0' },
    versions: ['1.0.0'],
  })

  expect(vi.getTimerCount()).toBe(0)
})

it('passes the API endpoint to get-npm-meta', async () => {
  getVersionsMock.mockResolvedValue({
    name: 'example',
    distTags: {
      latest: '1.0.0',
    },
    versionsMeta: {
      '1.0.0': {},
    },
    timeCreated: '2026-01-01T00:00:00.000Z',
    timeModified: '2026-01-01T00:00:00.000Z',
    lastSynced: Date.now(),
    specifier: '',
  })

  await fetchPackage('example', false, undefined, undefined, undefined, 'https://npm.example.com/')

  expect(getVersionsMock).toHaveBeenCalledWith('example', expect.objectContaining({
    apiEndpoint: 'https://npm.example.com/',
  }))
})

it('uses the configured API endpoint when resolving a dependency', async () => {
  getVersionsMock.mockResolvedValue({
    name: 'custom-endpoint-example',
    distTags: {
      latest: '1.0.0',
    },
    versionsMeta: {
      '1.0.0': {},
    },
    timeCreated: '2026-01-01T00:00:00.000Z',
    timeModified: '2026-01-01T00:00:00.000Z',
    lastSynced: Date.now(),
    specifier: '',
  })

  await resolveDependency({
    name: 'custom-endpoint-example',
    currentVersion: '^0.1.0',
    source: 'dependencies',
    update: true,
  }, {
    fastNpmMetaApiEndpoint: 'https://npm.example.com/',
    mode: 'major',
  })

  expect(getVersionsMock).toHaveBeenCalledWith('custom-endpoint-example', expect.objectContaining({
    apiEndpoint: 'https://npm.example.com/',
  }))
})
