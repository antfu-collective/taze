export function getVersionRange(v: string) {
  const leadings = ['>=', '<=', '>', '<', '~', '^']
  const ver = v.trim()
  if (ver === '*')
    return '*'
  if (+ver[0] < 10)
    return ''
  if (ver[0] === '~' || ver[0] === '^')
    return ver[0]
  for (const leading of leadings) {
    if (ver.startsWith(leading))
      return leading
  }
  return null
}
