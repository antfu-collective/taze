function escapeRegExp(str: string) {
  return str.replace(/[.+?^${}()|[\]\\]/g, '\\$&') // $& means the whole matched string
}

export function filterToRegex(str: string) {
  if (str.startsWith('/')) {
    const endIndex = str.lastIndexOf('/')
    const regexp = str.substring(1, endIndex)
    const flags = str.substring(endIndex + 1, str.length)
    return new RegExp(regexp, flags)
  }
  return new RegExp(`^${escapeRegExp(str).replace(/\*+/g, '.*?')}$`)
}

export function parseFilter(str?: string, defaultValue = true): ((name: string) => boolean) {
  if (!str)
    return () => defaultValue

  const regex = str.split(',').map(filterToRegex)

  return (name) => {
    for (const reg of regex) {
      if (reg.test(name))
        return true
    }
    return false
  }
}

export function createDependenciesFilter(include?: string, exclude?: string) {
  const i = parseFilter(include, true)
  const e = parseFilter(exclude, false)
  return (name: string) => !e(name) && i(name)
}
