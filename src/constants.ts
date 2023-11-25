import type { CheckOptions, CommonOptions, UsageOptions } from './types'

export const LOG_LEVELS = ['debug', 'info', 'warn', 'error', 'silent'] as const

export const MODE_CHOICES = ['default', 'major', 'minor', 'patch', 'latest', 'newest'] as const

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
  dev: false,
  prod: false,
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
  interactive: false,
  install: false,
  update: false,
  all: false,
  sort: 'diff-asc',
  includeLocked: false,
}
