import { defineConfig } from 'taze'

export default defineConfig({
  exclude: [
    'lodash',
  ],
  packageMode: {
    'typescript': 'major',
    'unocss': 'ignore',
    '/vue/': 'latest',
  },
})
