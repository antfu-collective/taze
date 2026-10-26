import type { CheckOptions, ColorsOptions, PackageJsonMeta, ResolvedDepChange } from '../src/types'
import process from 'node:process'
import readline from 'node:readline'
import { stripVTControlCharacters } from 'node:util'
import c from 'ansis'
import { afterEach, expect, it, vi } from 'vitest'
import { promptInteractive } from '../src/commands/check/interactive'
import { renderChanges } from '../src/commands/check/render'
import { createSliceRender, writeInteractiveScreen } from '../src/render'
import { timeDifference } from '../src/utils/time'

const stdoutDescriptors = Object.fromEntries(
  ['isTTY', 'rows', 'columns'].map(key => [key, Object.getOwnPropertyDescriptor(process.stdout, key)]),
)

afterEach(() => {
  vi.restoreAllMocks()
  for (const [key, descriptor] of Object.entries(stdoutDescriptors)) {
    if (descriptor)
      Object.defineProperty(process.stdout, key, descriptor)
    else
      Reflect.deleteProperty(process.stdout, key)
  }
})

function mockTerminal(rows = 24) {
  Object.defineProperties(process.stdout, {
    isTTY: { configurable: true, value: true },
    rows: { configurable: true, value: rows },
    columns: { configurable: true, value: 120 },
  })
  vi.spyOn(readline, 'cursorTo').mockImplementation(() => true)
  vi.spyOn(readline, 'clearScreenDown').mockImplementation(() => true)
  return vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
}

function makePackage(count = 1): PackageJsonMeta {
  return {
    name: 'demo-project',
    private: true,
    version: '1.0.0',
    type: 'package.json',
    relative: 'package.json',
    filepath: '/tmp/package.json',
    raw: {},
    deps: [],
    resolved: Array.from({ length: count }, (_, index): ResolvedDepChange => ({
      name: `package-${String(index).padStart(2, '0')}`,
      currentVersion: '^1.0.0',
      targetVersion: '^2.0.0',
      source: 'dependencies',
      update: true,
      diff: 'major',
      provenanceDowngraded: false,
      pkgData: {
        versions: ['1.0.0', '2.0.0'],
        tags: { latest: '2.0.0' },
      },
    })),
  }
}

const options: CheckOptions = { group: false, timediff: false, nodecompat: false }

it('retains the original palette and leaves the focused row background unset by default', () => {
  const write = mockTerminal()
  const pkg = makePackage()
  const { lines } = renderChanges(pkg, options, { isSelected: () => true, isChecked: () => true })
  const output = lines.join('\n')

  expect(output).toContain(c.cyan('demo-project'))
  expect(output).toContain(c.cyan('❯ '))
  expect(output).toContain(c.green('◉'))
  expect(output).toContain(c.gray('^1.0.0'))
  expect(output).toContain(c.red('2.0.0'))

  writeInteractiveScreen(lines)
  const frame = String(write.mock.calls[0][0])
  expect(frame).not.toContain('\u001B[4')
  expect(stripVTControlCharacters(frame)).toBe(`${stripVTControlCharacters(output)}\n`)
})

it('overrides only configured colors without changing text or another render', () => {
  const pkg = makePackage()
  const original = renderChanges(pkg, options).lines.join('\n')
  const colors: ColorsOptions = { versionMajor: 'magenta', packageName: 'yellowBright', versionCurrent: false }
  const custom = renderChanges(pkg, { ...options, colors }).lines.join('\n')

  expect(custom).toContain(c.yellowBright('demo-project'))
  expect(custom).toContain(c.magenta('2.0.0'))
  expect(custom).not.toContain(c.gray('^1.0.0'))
  expect(custom).toContain(c.gray('^'))
  expect(stripVTControlCharacters(custom)).toBe(stripVTControlCharacters(original))
  expect(renderChanges(pkg, options).lines.join('\n')).toBe(original)

  const now = Date.UTC(2026, 0, 1)
  expect(timeDifference(now - 2 * 365 * 86400000, now, colors)).toBe(c.red('~2y'))

  colors.versionMajor = 'blue'
  expect(renderChanges(pkg, { ...options, colors }).lines.join('\n')).toContain(c.blue('2.0.0'))
})

it('keeps focus and background highlighting working when marker colors are disabled', () => {
  const write = mockTerminal(8)
  const pkg = makePackage(12)
  const colors: ColorsOptions = { interactivePointer: false, interactiveChecked: false, interactiveUnchecked: false, interactiveSelectedBg: '#333' }
  const { lines } = renderChanges(pkg, { ...options, colors }, {
    isSelected: dep => dep === pkg.resolved[3],
    isChecked: () => true,
  })
  const renderer = createSliceRender(colors)
  renderer.push(...lines.map(content => ({ content })))
  renderer.render(3)

  const frame = String(write.mock.calls[0][0])
  const focusedRow = frame.split('\n').find(line => line.includes('❯ '))!
  expect(stripVTControlCharacters(focusedRow)).toContain('package-03')
  expect(focusedRow).toContain(c.bgHex('#333').open)
  expect(focusedRow).toContain(c.red('2.0.0'))
  expect(frame.split(c.bgHex('#333').open)).toHaveLength(2)
})

it('uses the whole palette in both dependency and version selection', async () => {
  const write = mockTerminal()
  vi.spyOn(readline, 'emitKeypressEvents').mockImplementation(() => {})
  vi.spyOn(process.stdin, 'resume').mockReturnValue(process.stdin)
  vi.spyOn(process.stdin, 'pause').mockReturnValue(process.stdin)
  const colors: ColorsOptions = {
    interactiveChecked: 'magenta',
    interactiveDependencyName: 'magenta',
    interactivePointer: 'yellow',
    interactiveSelectedBg: '#333',
  }
  const result = promptInteractive([makePackage()], { ...options, colors })
  const dependencyFrame = String(write.mock.calls.find(call => String(call[0]).includes('demo-project'))![0])

  try {
    process.stdin.emit('keypress', '', { name: 'right' })
    const versionFrame = String(write.mock.calls.at(-1)![0])
    expect(dependencyFrame).toContain(c.yellow('❯ '))
    expect(dependencyFrame).toContain(c.magenta('◉'))
    expect(dependencyFrame).toContain(c.bgHex('#333').open)
    expect(versionFrame).toContain('Select a version for')
    expect(versionFrame).toContain(`${c.magenta.bold.open}package-00`)
    expect(versionFrame).toContain(c.yellow('❯ '))
    expect(versionFrame).toContain(c.bgHex('#333').open)
  }
  finally {
    process.stdin.emit('keypress', '', { name: 'escape' })
    process.stdin.emit('keypress', '', { name: 'return' })
    await result
  }
})

it.each([
  { key: 'releaseAgeUnderHour', age: 30 * 60000, text: '<1h', originalStyle: c.gray },
  { key: 'releaseAgeHours', age: 2 * 3600000, text: '~2h', originalStyle: c.green },
  { key: 'releaseAgeDays', age: 7 * 86400000, text: '~7d', originalStyle: c.green },
  { key: 'releaseAgeMonths', age: 90 * 86400000, text: '~3mo', originalStyle: c.yellow },
  { key: 'releaseAgeYears', age: 2 * 365 * 86400000, text: '~2y', originalStyle: c.red },
] as const)('configures $key independently of version colors', ({ key, age, text, originalStyle }) => {
  const now = Date.UTC(2026, 0, 1)
  const colors: ColorsOptions = { [key]: '#abc' }
  expect(timeDifference(now - age, now, colors)).toBe(c.hex('#abc')(text))
  expect(timeDifference(now - age, now, { versionMajor: '#abc' })).toBe(originalStyle(text))
})
