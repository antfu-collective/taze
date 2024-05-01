import type { CheckOptions, CommonOptions, UsageOptions } from './types'

export const LOG_LEVELS = ['debug', 'info', 'warn', 'error', 'silent'] as const

export const MODE_CHOICES = ['default', 'major', 'minor', 'patch', 'latest', 'newest', 'next'] as const

export const DEFAULT_COMMON_OPTIONS: CommonOptions = {
  cwd: '',
  loglevel: 'info',
  failOnOutdated: false,
  silent: false,
  recursive: false,
  force: false,
  ignorePaths: '',
  include: '',
  exclude: '',
  depFields: {},
}

export const DEFAULT_USAGE_OPTIONS: UsageOptions = {
  ...DEFAULT_COMMON_OPTIONS,
  detail: false,
  recursive: true,
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
  includeLocked: false,
}
