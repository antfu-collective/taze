import path from 'node:path'
import { expect, it } from 'vitest'
import { async as ezspawn } from '@jsdevtools/ez-spawn'

it('taze cli should just works', async () => {
  const binPath = path.resolve(__dirname, '../bin/taze.mjs')

  const proc = await ezspawn(process.execPath, [binPath], { stdio: 'pipe' })

  expect(proc.stderr).toBe('')
})
