import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],

    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: ['src/**/*.{ts,tsx}'],

      // Exclusões da SPEC §8: montagem da árvore React, sem regra de negócio.
      exclude: ['src/main.tsx', '**/*.d.ts', '**/types.ts'],

      // Sem gate no frontend: a SPEC restringe o threshold de 90% ao domínio da
      // API e ao script de importação. Aqui a cobertura é medida e publicada.
    },
  },
})
