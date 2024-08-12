import type { Addon } from '../types'

/**
 * Sync VS Code engine with the version of `@types/vscode`
 */
export const addonVSCode: Addon = {
  beforeWrite(pkg) {
    if (!pkg.raw?.engines?.vscode) {
      return
    }

    const version = pkg.raw.dependencies?.['@types/vscode']
      || pkg.raw.devDependencies?.['@types/vscode']
      || pkg.raw.peerDependencies?.['@types/vscode']

    if (version && pkg.raw.engines?.vscode !== version) {
      // eslint-disable-next-line no-console
      console.log(`[addon] Updated VS Code engine field to ${version}`)
      pkg.raw.engines.vscode = version
    }
  },
}
