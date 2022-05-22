/* eslint-disable no-console */
import readline from 'readline'
import c from 'picocolors'
import { createControlledPromise } from '@antfu/utils'
import type { CheckOptions, InteractiveContext, PackageMeta } from '../../types'
import { renderChanges } from './render'

export async function promptInteractive(pkgs: PackageMeta[], options: CheckOptions) {
  pkgs.forEach((i) => {
    i.interactiveChecked = true
    i.resolved.forEach((i) => {
      if (i.latestVersionAvailable && !i.update) {
        i.update = true
        i.interactiveChecked = false
        i.targetVersion = i.latestVersionAvailable
      }
      else {
        i.interactiveChecked = i.update
      }
    })
  })

  const listRenderer = createListRenderer(pkgs, options)
  let renderer: InteractiveRenderer = listRenderer

  process.stdin.resume()
  process.stdin.setEncoding('utf8')
  readline.emitKeypressEvents(process.stdin)
  if (process.stdin.isTTY)
    process.stdin.setRawMode(true)

  const promise = createControlledPromise<PackageMeta[]>()
  process.stdin.on('keypress', (str: string, key: TerminalKey) => {
    if ((key.ctrl && key.name === 'c') || key.name === 'escape') {
      process.exit()
    }
    else if (key.name === 'enter' || key.name === 'return') {
      console.clear()
      pkgs.forEach((i) => {
        i.resolved.forEach((i) => {
          i.update = !!i.interactiveChecked
        })
      })
      promise.resolve(pkgs)
    }

    if (renderer.onKey(key))
      renderer.render()
  })

  renderer.render()
  return await promise
    .finally(() => {
      renderer = {
        render: () => {},
        onKey: () => false,
      }
    })
}

interface TerminalKey {
  ctrl: boolean
  name: string
}

interface InteractiveRenderer {
  render(): void
  onKey(key: TerminalKey): boolean | void
}

export function createListRenderer(pkgs: PackageMeta[], options: CheckOptions): InteractiveRenderer {
  const deps = pkgs.flatMap(i => i.resolved.filter(i => i.update))
  let index = 0
  const ctx: InteractiveContext = {
    isSelected(dep) {
      return dep === deps[index]
    },
  }

  return {
    render() {
      console.clear()
      console.log(`${c.inverse(c.green(c.bold(' taze ')))} ${c.yellow(`${c.bold('⬆️⬇️')} to select, ${c.bold('space')} to toggle, ${c.bold('enter')} to confirm, ${c.bold('esc')} to cancel`)}`)
      console.log()

      const lines: string[] = []

      pkgs.forEach((pkg) => {
        lines.push(...renderChanges(pkg, options, ctx).lines)
      })

      console.log(lines.join('\n'))
    },
    onKey(key) {
      if (key.name === 'up') {
        index = (index - 1 + deps.length) % deps.length
        return true
      }
      else if (key.name === 'down') {
        index = (index + 1) % deps.length
        return true
      }
      else if (key.name === 'space') {
        deps[index].interactiveChecked = !deps[index].interactiveChecked
        return true
      }
    },
  }
}
