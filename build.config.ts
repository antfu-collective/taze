import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({
  entries: [
    'src/index',
    'src/cli',
  ],
  rollup: {
    inlineDependencies: true,
    json: {
      compact: true,
      namedExports: false,
      preferConst: true,
    },
    dts: {
      respectExternal: false,
    },
  },
  clean: true,
  declaration: true,
})
