/**
 * Parse input string like `package-1/package-2` to an array of packages
 */
export function parseYarnPackagePath(input: string): string[] {
  return input.match(/(@[^/]+\/)?([^/]+)/g) || []
}

/**
 * Parse input string like `package-1>package-2` to an array of packages
 */
export function parsePnpmPackagePath(input: string): string[] {
  return input.match(/[^>]+/g) || []
}
