import type { CheckOptions, CommonOptions } from './types'

export const LOG_LEVELS = ['debug', 'info', 'warn', 'error', 'silent'] as const

export const MODE_CHOICES = ['default', 'major', 'minor', 'patch', 'latest', 'newest', 'next'] as const

export const LOCKED_UPGRADE_MODE_CHOICES = ['auto', 'strict'] as const

export const DEFAULT_IGNORE_PATHS = [
  '**/node_modules/**',
  '**/dist/**',
  '**/public/**',
  '**/fixture/**',
  '**/fixtures/**',
]

export const DEFAULT_COMMON_OPTIONS: CommonOptions = {
  cwd: '',
  loglevel: 'info',
  failOnOutdated: false,
  silent: false,
  recursive: false,
  force: false,
  ignorePaths: '',
  ignoreOtherWorkspaces: true,
  include: '',
  exclude: '',
  depFields: {},
}

export const DEFAULT_CHECK_OPTIONS: CheckOptions = {
  ...DEFAULT_COMMON_OPTIONS,
  mode: 'default',
  write: false,
  global: false,
  // TODO: enable by default: !process.env.CI && process.stdout.isTTY,
  interactive: false,
  install: false,
  update: false,
  all: false,
  sort: 'diff-asc',
  group: true,
  includeLocked: false,
  lockedUpgradeMode: 'auto',
  nodecompat: true,
  maturityPeriod: 0,
}
