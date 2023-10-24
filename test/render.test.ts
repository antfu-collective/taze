import { expect, it } from 'vitest'
import { formatTable } from '../src/render'

it('formatTable', () => {
  expect(
    formatTable([
      ['hi', 'hello', 'foo'],
      ['hello', 'hi', 'foobar'],
    ], 'LRL'),
  ).toMatchInlineSnapshot(`
    [
      "hi     hello  foo   ",
      "hello     hi  foobar",
    ]
  `)
})
