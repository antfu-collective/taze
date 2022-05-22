import { expect, test } from 'vitest'
import { formatTable } from '../src/render'

test('formatTable', () => {
  expect(
    formatTable([
      ['hi', 'hello', 'foo'],
      ['hello', 'hi', 'foobar'],
    ],
    'LRL',
    ),
  ).toMatchInlineSnapshot(`
    [
      "hi     hello  foo   ",
      "hello     hi  foobar",
    ]
  `)
})
