import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    setupFiles: ['./test/setup.ts'],
    testTimeout: 10_000,
    env: {
      // Force ansis to emit real ANSI codes regardless of the host's TTY/CI
      // detection, so color-based assertions are deterministic everywhere.
      FORCE_COLOR: '1',
    },
  },
})
