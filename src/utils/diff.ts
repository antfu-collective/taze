import c from 'picocolors'

export const DiffMap = {
  'error': -1,
  'major': 0,
  'premajor': 1,
  'minor': 2,
  'preminor': 3,
  'patch': 4,
  'prepatch': 5,
  'prerelease': 6,
  '': 7,
}

export const DiffColors = {
  'error': c.black,
  'major': c.red,
  'premajor': c.bgRed,
  'minor': c.yellow,
  'preminor': c.bgYellow,
  'patch': c.green,
  'prepatch': c.bgGreen,
  'prerelease': c.bgBlack,
  '': c.bgBlack,
}
