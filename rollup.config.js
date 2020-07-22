/* eslint-disable @typescript-eslint/no-var-requires */

import typescript from 'rollup-plugin-typescript2'
import dts from 'rollup-plugin-dts'
import resolve from '@rollup/plugin-node-resolve'

const external = [
  'fs',
  'path',
  ...Object.keys(require('./package.json').dependencies),
]

const preset = {
  plugins: [
    resolve(),
    typescript(),
  ],
  external,
  onwarn(msg, warn) {
    if (!/Circular/.test(msg)) warn(msg)
  },
}

export default [
  {
    ...preset,
    input: 'src/cli.ts',
    output: [
      {
        file: 'dist/cli.js',
        format: 'cjs',
      },
    ],
  },
  {
    ...preset,
    input: 'src/index.ts',
    output: [
      {
        file: 'dist/index.js',
        format: 'cjs',
      },
      {
        file: 'dist/index.esm.js',
        format: 'esm',
      },
    ],
  },
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/index.d.ts',
      format: 'es',
    },
    plugins: [
      dts(),
    ],
    external,
  },
]
