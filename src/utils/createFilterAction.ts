export const createFilterAction = (filterOptions: string) => {
  if (!filterOptions)
    return null

  const separator = filterOptions.includes(',') ? ',' : filterOptions.includes(' ') ? ' ' : null

  if (separator !== null) {
    const filterArray = filterOptions.split(separator)

    return (depName: string) => filterArray.includes(depName)
  }

  // 尝试正则化
  let a: RegExp | null = null

  try {
    const endIndex = filterOptions.lastIndexOf('/')
    const regexp = filterOptions.substring(1, endIndex)
    const flags = filterOptions.substring(endIndex + 1, filterOptions.length)
    a = new RegExp(regexp, flags)
  }
  catch (e) {
    a = null
  }

  if (a)
    return (depName: string) => a!.test(depName)

  return null
}
