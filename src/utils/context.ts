import type { Queue } from '@henrygd/queue'
import { AsyncLocalStorage } from 'node:async_hooks'

export const queueContext = new AsyncLocalStorage<Queue>()
