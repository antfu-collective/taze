import { describe, expect, it } from 'vitest'
import { formatTable, sliceRenderLines } from '../src/render'

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

describe(sliceRenderLines, () => {
  it('keeps the focused line visible when slicing long lists', () => {
    const lines = Array.from({ length: 12 }, (_, index) => ({ content: `version-${index}` }))

    const slice = sliceRenderLines(lines, 8, 4, 80)
    const contents = slice.map(line => line.content)

    expect(contents).toStrictEqual([
      'version-7',
      'version-8',
      'version-9',
      'version-10',
    ])
  })
})
