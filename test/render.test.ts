import process from 'node:process'
import readline from 'node:readline'
import { afterEach, expect, it, vi } from 'vitest'
import { formatTable, writeInteractiveScreen } from '../src/render'

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

it('writeInteractiveScreen uses cursor-based redraw for tty output', () => {
  Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: true })

  const cursorToSpy = vi.spyOn(readline, 'cursorTo').mockImplementation(() => true)
  const clearScreenDownSpy = vi.spyOn(readline, 'clearScreenDown').mockImplementation(() => true)
  const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

  writeInteractiveScreen(['first line', 'second line'])

  expect(cursorToSpy).toHaveBeenCalledWith(process.stdout, 0, 0)
  expect(clearScreenDownSpy).toHaveBeenCalledWith(process.stdout)
  expect(writeSpy).toHaveBeenCalledWith('first line\nsecond line\n')
})
