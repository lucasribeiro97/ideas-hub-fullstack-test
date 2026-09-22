import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout.tsx'
import { NotFoundPage } from './pages/NotFoundPage.tsx'
import { UserDetailPage } from './pages/UserDetailPage.tsx'
import { UserFormPage } from './pages/UserFormPage.tsx'
import { UsersListPage } from './pages/UsersListPage.tsx'
import { WeatherPage } from './pages/WeatherPage.tsx'

/**
 * Rotas da aplicação (TASK-WEB-02).
 *
 * Todas são endereços reais e abrem por URL direta — requisito do critério
 * S11, e o que permite compartilhar o link de um usuário específico.
 *
 * `/users/new` vem antes de `/users/:id` porque a ordem importa: sem isso,
 * "new" seria capturado como identificador e a tela de cadastro nunca abriria.
 */
export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Navigate to="/users" replace />} />
        <Route path="/users" element={<UsersListPage />} />
        <Route path="/users/new" element={<UserFormPage mode="create" />} />
        <Route path="/users/:id" element={<UserDetailPage />} />
        <Route path="/users/:id/edit" element={<UserFormPage mode="edit" />} />
        <Route path="/weather" element={<WeatherPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
