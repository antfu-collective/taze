import path from 'node:path'
import { expect, it } from 'vitest'
import { async as ezspawnAsync } from '@jsdevtools/ez-spawn'

it('taze cli should just works', async () => {
  const binPath = path.resolve(__dirname, '../bin/taze.mjs')

  const proc = await ezspawnAsync(process.execPath, [binPath], { stdio: 'pipe' })

  expect(proc.stderr).toBe('')
})
