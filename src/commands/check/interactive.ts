/* eslint-disable no-fallthrough */
/* eslint-disable no-console */
import readline from 'node:readline'
import process from 'node:process'
import c from 'picocolors'
import { createControlledPromise, notNullish } from '@antfu/utils'
import type { CheckOptions, InteractiveContext, PackageMeta, ResolvedDepChange } from '../../types'
import { getVersionOfRange, updateTargetVersion } from '../../io/resolves'
import { getPrefixedVersion } from '../../utils/versions'
import { FIG_BLOCK, FIG_NO_POINTER, FIG_POINTER, colorizeVersionDiff, createSliceRender, formatTable } from '../../render'
import { timeDifference } from '../../utils/time'
import { renderChanges } from './render'

export async function promptInteractive(pkgs: PackageMeta[], options: CheckOptions) {
  pkgs.forEach((i) => {
    i.interactiveChecked = true
    i.resolved.forEach((i) => {
      i.interactiveChecked = i.update
      if (i.latestVersionAvailable && !i.update) {
        i.interactiveChecked = false
        i.update = true
        updateTargetVersion(i, i.latestVersionAvailable, undefined, options.includeLocked)
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
        const sr = createSliceRender()
        const Y = (v: string) => c.bold(c.green(v))
        console.clear()
        sr.push({ content: `${FIG_BLOCK} ${c.gray(`${Y('↑↓')} to select, ${Y('space')} to toggle, ${Y('→')} to change version`)}`, fixed: true })
        sr.push({ content: `${FIG_BLOCK} ${c.gray(`${Y('enter')} to confirm, ${Y('esc')} to cancel`)}`, fixed: true })
        sr.push({ content: '', fixed: true })

        pkgs.forEach((pkg) => {
          sr.push(...renderChanges(pkg, options, ctx).lines.map(x => ({ content: x })))
        })

        sr.render(index)
      },
      onKey(key) {
        switch (key.name) {
          case 'escape':
            process.exit()
          case 'enter':
          case 'return':
            console.clear()
            pkgs.forEach((i) => {
              i.resolved.forEach((i) => {
                i.update = !!i.interactiveChecked
              })
            })
            promise.resolve(pkgs)
            break
          case 'up':
          case 'k':
            index = (index - 1 + deps.length) % deps.length
            return true
          case 'down':
          case 'j':
            index = (index + 1) % deps.length
            return true
          case 'space':
            deps[index].interactiveChecked = !deps[index].interactiveChecked
            return true
          case 'right':
          case 'l':
            renderer = createVersionSelectRender(deps[index])
            return true
        }
      },
    }
  }

  function createVersionSelectRender(
    dep: ResolvedDepChange,
  ): InteractiveRenderer {
    const versions = Object.entries({
      minor: getVersionOfRange(dep, 'minor'),
      patch: getVersionOfRange(dep, 'patch'),
      ...dep.pkgData.tags,
    })
      .map(([name, version]) => {
        if (!version)
          return undefined
        const targetVersion = getPrefixedVersion(dep.currentVersion, version)
        if (!targetVersion || targetVersion === dep.currentVersion)
          return undefined
        return {
          name,
          version,
          time: dep.pkgData.time?.[version],
          targetVersion: getPrefixedVersion(dep.currentVersion, version)!,
        }
      })
      .filter(notNullish)
    let index = 0

    return {
      render() {
        console.clear()
        console.log(`${FIG_BLOCK} ${c.gray(`Select a version for ${c.green(c.bold(dep.name))}${c.gray(` (current ${dep.currentVersion})`)}`)}`)
        console.log()
        console.log(
          formatTable(versions.map((v, idx) => {
            return [
              (index === idx ? FIG_POINTER : FIG_NO_POINTER) + (index === idx ? v.name : c.gray(v.name)),
              timeDifference(dep.currentVersionTime),
              c.gray(dep.currentVersion),
              c.dim(c.gray('→')),
              colorizeVersionDiff(dep.currentVersion, v.targetVersion),
              timeDifference(v.time),
            ]
          }), 'LLLL').join('\n'),
        )
      },
      onKey(key) {
        switch (key.name) {
          case 'escape':
            renderer = listRenderer
            return true
          case 'up':
          case 'k':
            index = (index - 1 + versions.length) % versions.length
            return true
          case 'down':
          case 'j':
            index = (index + 1) % versions.length
            return true
          // confirm
          case 'enter':
          case 'return':
          case 'left':
          case 'right':
          case 'h':
          case 'l':
            updateTargetVersion(dep, versions[index].version, undefined, options.includeLocked)
            renderer = listRenderer
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
