import type { PackageData } from '../src/types'
import { afterEach, expect, it, vi } from 'vitest'

const { fetchJsrPackageMetaMock, fetchPackageMock } = vi.hoisted(() => ({
  fetchJsrPackageMetaMock: vi.fn(),
  fetchPackageMock: vi.fn(),
}))

vi.mock('../src/utils/packument.ts', () => ({
  fetchJsrPackageMeta: fetchJsrPackageMetaMock,
  fetchPackage: fetchPackageMock,
}))

afterEach(() => {
  vi.restoreAllMocks()
  vi.resetModules()
  fetchJsrPackageMetaMock.mockReset()
  fetchPackageMock.mockReset()
})

it('dedupes concurrent requests for the same package', async () => {
  const packageData: PackageData = {
    tags: { latest: '5.8.3' },
    versions: ['5.8.3'],
  }

  let resolveFetch: ((value: PackageData) => void) | undefined
  const pendingFetch = new Promise<PackageData>((resolve) => {
    resolveFetch = resolve
  })

  fetchPackageMock.mockReturnValue(pendingFetch)

  const { getPackageData } = await import('../src/io/resolves')
  const firstRequest = getPackageData('typescript', 'npm', '/tmp', 15000)
  const secondRequest = getPackageData('typescript', 'npm', '/tmp', 15000)

  expect(fetchPackageMock).toHaveBeenCalledTimes(1)
  expect(fetchPackageMock).toHaveBeenCalledWith('typescript', false, '/tmp', 15000, undefined)

  resolveFetch?.(packageData)

  await expect(Promise.all([firstRequest, secondRequest])).resolves.toStrictEqual([packageData, packageData])
})
