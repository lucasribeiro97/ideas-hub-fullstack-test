import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],

    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      // `include` sozinho já traz arquivos sem teste algum para o relatório —
      // essencial para que um módulo nunca importado apareça como 0% em vez de
      // ficar invisível e inflar a média.
      include: ['src/**/*.ts'],

      // Exclusões da SPEC §8. Cada uma tem motivo escrito lá; exclusão
      // silenciosa seria maquiagem de métrica.
      exclude: [
        'src/server.ts', // bootstrap: wiring de inicialização
        'src/db/migrations/**', // schema versionado, verificado pela própria migration
        '**/*.d.ts',
        '**/types.ts',
      ],

      // Gate seletivo: 90% só onde mora regra de negócio. A cobertura global é
      // medida e publicada, mas não falha o build — ver SPEC §8 para o porquê.
      thresholds: {
        'src/modules/**/*.ts': { lines: 90, branches: 90 },
        'src/scripts/**/*.ts': { lines: 90, branches: 90 },
      },
    },
  },
})
