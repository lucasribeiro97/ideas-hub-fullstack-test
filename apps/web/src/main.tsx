import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { App } from './App.tsx'
import { criarQueryClient } from './lib/queryClient.ts'
import './index.css'

const raiz = document.getElementById('root')
if (!raiz) throw new Error('Elemento #root não encontrado no index.html')

createRoot(raiz).render(
  <StrictMode>
    <QueryClientProvider client={criarQueryClient()}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
