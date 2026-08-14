import type { CheckOptions, CommonOptions } from './types'

export const LOG_LEVELS = ['debug', 'info', 'warn', 'error', 'silent'] as const

export const MODE_CHOICES = ['default', 'major', 'minor', 'patch', 'latest', 'newest', 'stable', 'next'] as const

export const DEFAULT_IGNORE_PATHS = [
  '**/.git/**',
  '**/node_modules/**',
  '**/dist/**',
  '**/public/**',
  '**/fixture/**',
  '**/fixtures/**',
]

const DEFAULT_COMMON_OPTIONS: CommonOptions = {
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
  githubActions: true,
  nodeVersion: true,
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
  json: false,
  sort: 'diff-asc',
  requestTimeout: 5000,
  group: true,
  includeLocked: false,
  nodecompat: true,
  retry: 4,
}
