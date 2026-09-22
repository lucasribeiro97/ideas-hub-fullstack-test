import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],

    // Sobe um único Postgres efêmero para toda a execução.
    globalSetup: ['./tests/helpers/global-setup.ts'],

    // Os testes de integração compartilham o mesmo banco e limpam a tabela
    // entre casos. Rodar arquivos em paralelo faria uma suíte apagar os dados
    // da outra no meio da execução, produzindo falha intermitente — o tipo de
    // teste instável que destrói a confiança na suíte.
    fileParallelism: false,

    // O start do container entra no tempo do primeiro teste.
    testTimeout: 30_000,
    hookTimeout: 60_000,

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
        // Ponto de entrada do comando de importação. É testado por
        // subprocesso, execução que o coletor v8 não consegue atribuir — ver
        // SPEC §8 para a distinção entre esta exclusão e as demais.
        'src/scripts/import-users.ts',
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
