// ported from: https://github.com/raineorshine/npm-check-updates/blob/master/lib/package-managers/npm.js

// @ts-expect-error missing types
import libnpmconfig from 'libnpmconfig'

// needed until pacote supports full npm config compatibility
// See: https://github.com/zkat/pacote/issues/156
const npmConfig: any = {}
libnpmconfig.read().forEach((value: string, key: string) => {
  // replace env ${VARS} in strings with the process.env value
  npmConfig[key] = typeof value !== 'string'
    ? value
    : value.replace(/\${([^}]+)}/, (_, envVar) =>
      (process.env as any)[envVar],
    )
})
npmConfig.cache = false

export { npmConfig }
