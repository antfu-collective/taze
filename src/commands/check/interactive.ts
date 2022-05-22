/* eslint-disable no-console */
import readline from 'readline'
import c from 'picocolors'
import { createControlledPromise, notNullish } from '@antfu/utils'
import type { CheckOptions, InteractiveContext, PackageMeta, ResolvedDepChange } from '../../types'
import { getVersionOfRange, updateTargetVersion } from '../../io/resolves'
import { getPrefixedVersion } from '../../utils/versions'
import { renderChanges } from './render'

export async function promptInteractive(pkgs: PackageMeta[], options: CheckOptions) {
  pkgs.forEach((i) => {
    i.interactiveChecked = true
    i.resolved.forEach((i) => {
      i.interactiveChecked = i.update
      if (i.latestVersionAvailable && !i.update) {
        i.interactiveChecked = false
        i.update = true
        updateTargetVersion(i, i.latestVersionAvailable)
      }
    })
  })

  if (!pkgs.some(i => i.resolved.some(i => i.update)))
    return []

  const promise = createControlledPromise<PackageMeta[]>()

  const listRenderer = createListRenderer()
  let renderer: InteractiveRenderer = listRenderer

  registerInput()

  renderer.render()
  return await promise
    .finally(() => {
      renderer = {
        render: () => {},
        onKey: () => false,
      }
    })

  // ==== functions ====

  function createListRenderer(): InteractiveRenderer {
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
        console.log(`${c.green(c.bold('taze interactive'))} ${c.yellow('[experimental]')}`)
        console.log(c.blue(`${c.bold('⬆️⬇️')} to select, ${c.bold('space')} to toggle, ${c.bold('enter')} to confirm, ${c.bold('esc')} to cancel`))
        console.log()

        const lines: string[] = []

        pkgs.forEach((pkg) => {
          lines.push(...renderChanges(pkg, options, ctx).lines)
        })

        console.log(lines.join('\n'))
      },
      onKey(key) {
        if (key.name === 'escape') {
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
        else if (key.name === 'up') {
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
        // TODO: make it ready
        // else if (key.name === 'right') {
        //   renderer = createVersionSelectRender(deps[index])
        //   return true
        // }
      },
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function createVersionSelectRender(
    dep: ResolvedDepChange,
  ): InteractiveRenderer {
    const versions = Object.entries({
      major: getVersionOfRange(dep, 'major'),
      minor: getVersionOfRange(dep, 'minor'),
      path: getVersionOfRange(dep, 'patch'),
      ...dep.pkgData.tags,
    })
      .map(([name, version]) => {
        if (!version)
          return undefined
        return {
          name,
          version,
          time: dep.pkgData.time?.[version],
          targetVersion: getPrefixedVersion(dep.currentVersion, version),
        }
      })
      .filter(notNullish)
    let index = 0

    return {
      render() {
        console.clear()
        console.log(versions)
        console.log(`Select version for ${c.cyan(c.bold(dep.name))} (current ${dep.currentVersion})`)
        console.log()
      },
      onKey(key) {
        if (key.name === 'escape') {
          renderer = listRenderer
          return true
        }
        else if (key.name === 'up') {
          index = (index - 1 + versions.length) % versions.length
          return true
        }
        else if (key.name === 'down') {
          index = (index + 1) % versions.length
          return true
        }
      },
    }
  }

  function registerInput() {
    process.stdin.resume()
    process.stdin.setEncoding('utf8')
    readline.emitKeypressEvents(process.stdin)
    if (process.stdin.isTTY)
      process.stdin.setRawMode(true)

    process.stdin.on('keypress', (str: string, key: TerminalKey) => {
      if ((key.ctrl && key.name === 'c'))
        process.exit()

      const result = renderer.onKey(key)
      if (result && typeof result !== 'boolean')
        renderer = result
      if (result)
        renderer.render()
    })
  }
}

interface TerminalKey {
  ctrl: boolean
  name: string
}

interface InteractiveRenderer {
  render(): void
  onKey(key: TerminalKey): boolean | InteractiveRenderer | void
}

