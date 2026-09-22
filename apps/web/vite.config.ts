import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],

  // Lê o .env da raiz do repositório em vez de um por app. Backend e frontend
  // são pacotes independentes, mas quem for executar o projeto configura um
  // arquivo só — menos passo manual e menos chance de divergência.
  envDir: fileURLToPath(new URL('../../', import.meta.url)),

  server: {
    port: 5173,
  },
})
