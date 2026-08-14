import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchNodeReleases } from '../src/utils/node'

const { fetchMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
}))

vi.mock('ofetch', () => ({
  fetch: fetchMock,
}))

afterEach(() => {
  fetchMock.mockReset()
})

describe('fetchNodeReleases', () => {
  it('loads, filters, sorts, and dates official stable releases', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify([
      { version: 'v22.1.0', date: '2025-01-02' },
      { version: 'v23.0.0-rc.1', date: '2025-02-01' },
      { version: 'latest', date: '2025-03-01' },
      { version: 'v20.10.0', date: '2024-01-01' },
    ])))

    const data = await fetchNodeReleases(1234)

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock).toHaveBeenCalledWith(
      'https://nodejs.org/dist/index.json',
      expect.objectContaining({
        headers: expect.objectContaining({
          'accept': 'application/json',
          'user-agent': expect.stringContaining('taze@npm'),
        }),
        signal: expect.any(AbortSignal),
      }),
    )
    expect(data).toEqual({
      tags: { latest: 'v22.1.0' },
      versions: ['v20.10.0', 'v22.1.0'],
      time: {
        'v20.10.0': '2024-01-01T00:00:00.000Z',
        'v22.1.0': '2025-01-02T00:00:00.000Z',
      },
    })
  })

  it('rejects unsuccessful responses', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 503 }))

    await expect(fetchNodeReleases()).rejects.toThrow('Failed to fetch Node.js releases: 503')
  })
})
