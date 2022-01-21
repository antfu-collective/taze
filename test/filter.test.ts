import { expect, test } from 'vitest'
import { createDependenciesFilter, filterToRegex } from '../src/utils/dependenciesFilter'

test('filterToRegex', () => {
  // exact match
  expect(filterToRegex('hello').source).toBe('^hello$')

  // wildcard
  expect(filterToRegex('react-*').source).toBe('^react-.*?$')

  // escape control chars
  expect(filterToRegex('@p?react/*').source).toBe('^@p\\?react\\/.*?$')

  // support regex
  expect(filterToRegex('/@p?react\\/.*/').source).toBe('@p?react\\/.*')

  // flags
  expect(filterToRegex('/react/gi').source).toBe('react')
  expect(filterToRegex('/react/gi').flags).toBe('gi')
})

test('filterToRegex match', () => {
  expect(filterToRegex('hello').test('hello')).toBe(true)
  expect(filterToRegex('hello').test('hell')).toBe(false)

  expect(filterToRegex('react-*').test('react-hello-world')).toBe(true)

  expect(filterToRegex('/@p?react\\/.*/').test('@react/hello')).toBe(true)
  expect(filterToRegex('/@p?react\\/.*/').test('@preact/hello')).toBe(true)
})

test('createDependenciesFilter', () => {
  const filter = createDependenciesFilter(
    'react-*',
    'react-hello,react-hey,/react-\\d[a-z]/',
  )

  expect(filter('vue')).toBe(false)
  expect(filter('react')).toBe(false)
  expect(filter('react-hello')).toBe(false)
  expect(filter('react-haha')).toBe(true)
  expect(filter('react-hey')).toBe(false)
  expect(filter('react-0')).toBe(true)
  expect(filter('react-00')).toBe(true)
  expect(filter('react-0w')).toBe(false)
})
