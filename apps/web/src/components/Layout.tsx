import { NavLink, Outlet } from 'react-router-dom'

const LINKS = [
  { to: '/users', label: 'Usuários' },
  { to: '/weather', label: 'Clima' },
]

/**
 * Estrutura comum a todas as telas.
 *
 * O link de pular para o conteúdo é o primeiro elemento focável da página:
 * sem ele, quem navega por teclado percorre a navegação inteira a cada troca
 * de tela antes de chegar ao que mudou (critério S14).
 *
 * `NavLink` marca o item ativo com `aria-current`, e não apenas com cor —
 * quem usa leitor de tela precisa dessa informação, e quem não distingue as
 * cores também.
 */
export function Layout() {
  return (
    <div className="app">
      <a className="skip-link" href="#conteudo">
        Pular para o conteúdo
      </a>

      <header className="app__header">
        <nav aria-label="Navegação principal">
          <ul>
            {LINKS.map((link) => (
              <li key={link.to}>
                <NavLink
                  to={link.to}
                  className={({ isActive }) => (isActive ? 'is-active' : undefined)}
                >
                  {link.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <main className="app__main" id="conteudo" tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  )
}
