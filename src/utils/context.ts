import type { Queue } from '@henrygd/queue'
import type { PackageData } from '../types'
import { AsyncLocalStorage } from 'node:async_hooks'

export const queueContext = new AsyncLocalStorage<Queue>()
export const nodeReleaseDataContext = new AsyncLocalStorage<Promise<PackageData>>()
