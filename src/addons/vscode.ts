import type { Addon } from '../types'
import { findMinimumForRange, isGreater } from 'verkit'

/**
 * Sync VS Code engine with the version of `@types/vscode`
 */
export const addonVSCode: Addon = {
  beforeWrite(pkg) {
    if (!pkg.raw?.engines?.vscode) {
      return
    }

    const version: string = pkg.raw.dependencies?.['@types/vscode']
      || pkg.raw.devDependencies?.['@types/vscode']
      || pkg.raw.peerDependencies?.['@types/vscode']
      || ''

    // Protocols like `workspace:` and `catalog:`, we skip them
    if (!version || version.includes(':')) {
      return
    }

    const minEngineVersion = findMinimumForRange(pkg.raw.engines.vscode)
    const minVersion = findMinimumForRange(version)
    if (!minEngineVersion || !minVersion) {
      return
    }

    if (isGreater(minVersion, minEngineVersion)) {
      // eslint-disable-next-line no-console
      console.log(`[taze addon] Updated VS Code engine field to ${version}`)
      // If the version is not a range (fixed version), we prepend it with a caret
      pkg.raw.engines.vscode = /[>^<:~]/.test(version) ? version : `^${version}`
    }
  },
}
