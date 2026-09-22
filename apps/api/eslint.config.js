import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist/**', 'coverage/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Argumento iniciado por _ é descarte intencional (ex.: desestruturação
      // que remove uma chave de um objeto).
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],

      // Desligada de propósito: no Fastify, plugins e handlers são assíncronos
      // por contrato, mesmo quando o corpo não tem `await`. Manter a regra
      // obrigaria a poluir rotas simples com `await Promise.resolve()`, que é
      // pior que o problema que ela evita.
      '@typescript-eslint/require-await': 'off',
    },
  },
  // JavaScript fora do projeto TypeScript: arquivos de configuração e os
  // scripts de build em `scripts/`. As regras que exigem informação de tipo não
  // se aplicam a eles, e tentar aplicá-las quebra a análise com
  // "was not found by the project service".
  //
  // O `.mjs` precisa estar aqui junto do `.js`: o padrão anterior cobria só o
  // segundo, e os dois scripts de build entraram como `.mjs` — a falha apareceu
  // na integração contínua, não aqui, porque eu não rodei o lint depois de
  // criá-los.
  {
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      // Sem os tipos do TypeScript, o ESLint não sabe que estes arquivos rodam
      // no Node e acusa `console`, `process` e `URL` como indefinidos. A lista
      // é explícita, e não o pacote `globals`, para não acrescentar dependência
      // por causa de três nomes.
      globals: {
        console: 'readonly',
        process: 'readonly',
        URL: 'readonly',
      },
    },
  },
)
