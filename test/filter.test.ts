import test from 'ava'
import { createDependenciesFilter, filterToRegex } from '../src/utils/dependenciesFilter'

test('filterToRegex', (t) => {
  // exact match
  t.is(filterToRegex('hello').source, '^hello$')

  // wildcard
  t.is(filterToRegex('react-*').source, '^react-.*?$')

  // escape control chars
  t.is(filterToRegex('@p?react/*').source, '^@p\\?react\\/.*?$')

  // support regex
  t.is(filterToRegex('/@p?react\\/.*/').source, '@p?react\\/.*')

  // flags
  t.is(filterToRegex('/react/gi').source, 'react')
  t.is(filterToRegex('/react/gi').flags, 'gi')
})

test('filterToRegex match', (t) => {
  t.is(filterToRegex('hello').test('hello'), true)
  t.is(filterToRegex('hello').test('hell'), false)

  t.is(filterToRegex('react-*').test('react-hello-world'), true)

  t.is(filterToRegex('/@p?react\\/.*/').test('@react/hello'), true)
  t.is(filterToRegex('/@p?react\\/.*/').test('@preact/hello'), true)
})

test('createDependenciesFilter', (t) => {
  const filter = createDependenciesFilter(
    'react-*',
    'react-hello,react-hey,/react-\\d[a-z]/',
  )

  t.is(filter('vue'), false)
  t.is(filter('react'), false)
  t.is(filter('react-hello'), false)
  t.is(filter('react-haha'), true)
  t.is(filter('react-hey'), false)
  t.is(filter('react-0'), true)
  t.is(filter('react-00'), true)
  t.is(filter('react-0w'), false)
})
