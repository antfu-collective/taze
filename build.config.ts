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
      namedExports: true,
      preferConst: true,
    },
    commonjs: {
      requireReturnsDefault: 'auto',
    },
    dts: {
      respectExternal: false,
    },
  },
  clean: true,
  declaration: true,
})
