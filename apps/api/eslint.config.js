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
  // Arquivos de configuração em JS ficam fora do projeto TypeScript, então as
  // regras que exigem informação de tipo não se aplicam a eles.
  {
    files: ['**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },
)
