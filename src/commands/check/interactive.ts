import type { CheckOptions, InteractiveContext, PackageMeta, ResolvedDepChange } from '../../types'
/* eslint-disable no-fallthrough */
import process from 'node:process'
/* eslint-disable no-console */
import readline from 'node:readline'
import { createControlledPromise, notNullish } from '@antfu/utils'
import c from 'ansis'
import { getVersionOfRange, updateTargetVersion } from '../../io/resolves'
import { colorizeVersionDiff, createSliceRender, FIG_BLOCK, FIG_NO_POINTER, FIG_POINTER, formatTable } from '../../render'
import { sortDepChanges } from '../../utils/sort'
import { timeDifference } from '../../utils/time'
import { getPrefixedVersion } from '../../utils/versions'
import { renderChanges } from './render'

export async function promptInteractive(pkgs: PackageMeta[], options: CheckOptions) {
  const {
    sort = 'diff-asc',
    group = true,
    timediff = true,
  } = options

  const checked = new Set<object>()

  pkgs.forEach((pkg) => {
    pkg.resolved.forEach((dep) => {
      if (dep.update) {
        checked.add(dep)
      }
      else if (dep.latestVersionAvailable) {
        // Set `update` flag to true to render option in the list,
        // but don't check it by default.
        dep.update = true
        updateTargetVersion(dep, dep.latestVersionAvailable, undefined, options.includeLocked)
      }
    })
  })

  if (flatDeps().length === 0)
    return []

  const promise = createControlledPromise<PackageMeta[]>()

  sortDeps()
  let renderer: InteractiveRenderer = createListRenderer()

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

  function flatDeps() {
    return pkgs.flatMap(pkg => pkg.resolved.filter(dep => dep.update))
  }

  function sortDeps() {
    pkgs.forEach((pkg) => {
      pkg.resolved = sortDepChanges(pkg.resolved, sort, group)
    })
  }

  function createListRenderer(initialSelected?: ResolvedDepChange): InteractiveRenderer {
    const deps = flatDeps()

    let index = 0
    if (initialSelected)
      index = Math.max(0, deps.findIndex(dep => dep === initialSelected))

    const ctx: InteractiveContext = {
      isChecked: dep => checked.has(dep),
      isSelected: dep => dep === deps[index],
    }

    return {
      render() {
        const sr = createSliceRender()
        const Y = (v: string) => c.bold.green(v)
        console.clear()
        sr.push({ content: `${FIG_BLOCK} ${c.gray`${Y('↑↓')} to select, ${Y('space')} to toggle, ${Y('→')} to change version`}`, fixed: true })
        sr.push({ content: `${FIG_BLOCK} ${c.gray`${Y('enter')} to confirm, ${Y('esc')} to cancel, ${Y('a')} to select/unselect all`}`, fixed: true })
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
            pkgs.forEach((pkg) => {
              pkg.resolved.forEach((dep) => {
                dep.update = ctx.isChecked(dep)
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
          case 'space': {
            const dep = deps[index]
            if (checked.has(dep))
              checked.delete(dep)
            else
              checked.add(dep)
            return true
          }
          case 'right':
          case 'l':
            renderer = createVersionSelectRender(deps[index])
            return true
          case 'a':
            if (deps.every(dep => checked.has(dep)))
              checked.clear()
            else
              deps.forEach(dep => checked.add(dep))
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
        console.log(`${FIG_BLOCK} ${c.gray`Select a version for ${c.green.bold(dep.name)}${c.gray` (current ${dep.currentVersion})`}`}`)
        console.log()
        console.log(
          formatTable(versions.map((v, idx) => {
            return [
              (index === idx ? FIG_POINTER : FIG_NO_POINTER) + (index === idx ? v.name : c.gray(v.name)),
              timediff ? timeDifference(dep.currentVersionTime) : '',
              c.gray(dep.currentVersion),
              c.dim.gray('→'),
              colorizeVersionDiff(dep.currentVersion, v.targetVersion),
              timediff ? timeDifference(v.time) : '',
            ]
          }), 'LLLL').join('\n'),
        )
      },
      onKey(key) {
        switch (key.name) {
          case 'escape':
            renderer = createListRenderer(dep)
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

            // Order may have changed so we need to sort to keep navigation
            // in sync with the rendering.
            sortDeps()

            renderer = createListRenderer(dep)
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
  render: () => void
  onKey: (key: TerminalKey) => boolean | InteractiveRenderer | void
}
