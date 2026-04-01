import antfu from '@antfu/eslint-config'

export default antfu({
  ignores: [
    'test/fixtures/**',
  ],
  e18e: false,
})
