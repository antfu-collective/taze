export function toArray<T>(a: T | T[] | undefined | null): T[] {
  if (a == null)
    return []
  return Array.isArray(a) ? a : [a]
}
