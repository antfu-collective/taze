/* eslint-disable @typescript-eslint/no-var-requires */

import typescript from 'rollup-plugin-typescript2'
import resolve from '@rollup/plugin-node-resolve'

const external = [
  'fs',
  'path',
  ...Object.keys(require('./package.json').dependencies),
]

export default [
  {
    input: 'src/cli.ts',
    output: [
      {
        file: 'dist/cli.js',
        format: 'cjs',
      },
    ],
    plugins: [
      resolve(),
      typescript({
        tsconfigOverride: {
          tsconfig: 'tsconfig.json',
          compilerOptions: {
            module: 'ESNext',
          },
        },
      }),
    ],
    external,
    onwarn(msg, warn) {
      if (!/Circular/.test(msg)) warn(msg)
    },
  },
  // {
  //   input: 'src/cli.ts',
  //   output: {
  //     file: 'dist/cli.d.ts',
  //     format: 'es',
  //   },
  //   plugins: [dts()],
  //   external,
  // },
]
