import process from 'node:process'
import readline from 'node:readline'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatTable, hideInteractiveCursor, showInteractiveCursor, sliceRenderLines, writeInteractiveScreen } from '../src/render'

const originalIsTTYDescriptor = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY')

afterEach(() => {
  vi.restoreAllMocks()

  if (originalIsTTYDescriptor) {
    Object.defineProperty(process.stdout, 'isTTY', originalIsTTYDescriptor)

    return
  }

  Reflect.deleteProperty(process.stdout, 'isTTY')
})

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

it('writeInteractiveScreen overwrites tty output before clearing below', () => {
  Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: true })

  const cursorToSpy = vi.spyOn(readline, 'cursorTo').mockImplementation(() => true)
  const clearScreenDownSpy = vi.spyOn(readline, 'clearScreenDown').mockImplementation(() => true)
  const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

  writeInteractiveScreen(['first line', 'second line'])

  const cursorToCallOrder = cursorToSpy.mock.invocationCallOrder[0]
  const writeCallOrder = writeSpy.mock.invocationCallOrder[0]
  const clearCallOrder = clearScreenDownSpy.mock.invocationCallOrder[0]

  expect(cursorToSpy).toHaveBeenCalledWith(process.stdout, 0, 0)
  expect(writeSpy).toHaveBeenCalledWith('first line\u001B[K\nsecond line\u001B[K\n')
  expect(clearScreenDownSpy).toHaveBeenCalledWith(process.stdout)
  expect(cursorToCallOrder).toBeLessThan(writeCallOrder)
  expect(writeCallOrder).toBeLessThan(clearCallOrder)
})

it('writeInteractiveScreen clears tty output when frame is empty', () => {
  Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: true })

  const cursorToSpy = vi.spyOn(readline, 'cursorTo').mockImplementation(() => true)
  const clearScreenDownSpy = vi.spyOn(readline, 'clearScreenDown').mockImplementation(() => true)
  const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

  writeInteractiveScreen([])

  expect(cursorToSpy).toHaveBeenCalledWith(process.stdout, 0, 0)
  expect(writeSpy).not.toHaveBeenCalled()
  expect(clearScreenDownSpy).toHaveBeenCalledWith(process.stdout)
})

it('hideInteractiveCursor writes the hide-cursor sequence for tty output', () => {
  Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: true })

  const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

  hideInteractiveCursor()

  expect(writeSpy).toHaveBeenCalledWith('\u001B[?25l')
})

it('showInteractiveCursor writes the show-cursor sequence for tty output', () => {
  Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: true })

  const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

  showInteractiveCursor()

  expect(writeSpy).toHaveBeenCalledWith('\u001B[?25h')
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
