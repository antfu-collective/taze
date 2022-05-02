import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({
  entries: [
    'src/index',
    'src/cli',
  ],
  rollup: {
    inlineDependencies: true,
  },
  clean: true,
  declaration: true,
})
