import type { Addon } from '../types'

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
    if (version.includes(':')) {
      return
    }

    if (version && pkg.raw.engines?.vscode !== version) {
      // eslint-disable-next-line no-console
      console.log(`[taze addon] Updated VS Code engine field to ${version}`)
      // If the version is not a range (fixed version), we prepend it with a caret
      pkg.raw.engines.vscode = /[>^<:~]/.test(version) ? version : `^${version}`
    }
  },
}
