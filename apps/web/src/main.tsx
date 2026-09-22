import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { App } from './App.tsx'
import { createQueryClient } from './lib/queryClient.ts'
import './index.css'

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Elemento #root não encontrado no index.html')

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={createQueryClient()}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
