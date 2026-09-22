import { Link, Route, Routes } from 'react-router-dom'

/**
 * Esqueleto de rotas (TASK-INFRA-05).
 *
 * As telas reais chegam em M5 e M6; aqui ficam apenas os pontos de montagem,
 * para que a navegação e o layout base sejam verificáveis desde já.
 */
export function App() {
  return (
    <div className="app">
      <header className="app__header">
        <nav aria-label="Navegação principal">
          <Link to="/users">Usuários</Link>
          <Link to="/weather">Clima</Link>
        </nav>
      </header>

      <main className="app__main">
        <Routes>
          <Route path="/" element={<h1>Ideas Hub</h1>} />
          <Route path="/users" element={<h1>Usuários</h1>} />
          <Route path="/weather" element={<h1>Clima</h1>} />
          <Route path="*" element={<h1>Página não encontrada</h1>} />
        </Routes>
      </main>
    </div>
  )
}
