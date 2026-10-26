export const DiffMap = {
  'error': -1,
  'major': 0,
  'minor': 1,
  'patch': 2,
  'pin': 3,
  '': 4,
}

export const DiffColorMap = {
  major: 'versionMajor',
  minor: 'versionMinor',
  patch: 'versionPatch',
  error: 'versionError',
  pin: 'versionPin',
} as const
