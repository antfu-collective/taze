export const DiffMap = {
  'error': -1,
  'major': 0,
  'minor': 1,
  'patch': 2,
  'pin': 3,
  '': 4,
}

export const DiffColorMap = {
  major: 'red',
  minor: 'cyan',
  patch: 'green',
  error: 'red',
  pin: 'blue',
} as const
