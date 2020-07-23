export const createFilterAction = (filterOptions: string[]) => {
  if (!filterOptions || !filterOptions.length)
    return () => true

  if (filterOptions.length === 1) {
    const filter = filterOptions[0]
    const separator = filter.includes(',') ? ',' : null

    if (separator !== null) {
      const filterArray = filter.split(separator)

      return (depName: string) => filterArray.includes(depName)
    }

    let regex: RegExp | null = null

    try {
      const endIndex = filter.lastIndexOf('/')
      const regexp = filter.substring(1, endIndex)
      const flags = filter.substring(endIndex + 1, filter.length)
      regex = new RegExp(regexp, flags)
    }
    catch (e) {
      regex = null
    }

    if (regex)
      return (depName: string) => regex!.test(depName)
  }

  return (depName: string) => filterOptions.includes(depName)
}
