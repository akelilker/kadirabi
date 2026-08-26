import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

/** Production sub-path on karmotors.com.tr — do not hardcode in components. */
const PRODUCTION_BASE = '/kadirabi/'

export default defineConfig({
  base: PRODUCTION_BASE,
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
