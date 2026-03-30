import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: [
    'src/index',
    'src/cli',
  ],
  dts: true,
  exports: true,
  deps: {
    onlyBundle: false
  }
})
