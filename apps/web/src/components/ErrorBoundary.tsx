import { Component, type ErrorInfo, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
  /** Recebe o erro; usado nos testes para afirmar que ele não foi engolido. */
  onError?: (error: Error, info: ErrorInfo) => void
}

interface ErrorBoundaryState {
  error: Error | null
}

/**
 * Impede que uma exceção de render derrube a aplicação inteira.
 *
 * Sem isso, qualquer exceção durante o render faz o React desmontar a árvore
 * toda: some o cabeçalho, some a navegação, a página fica em branco e não há
 * como sair sem recarregar. Não é hipotético — `formatDate` chama
 * `Intl.DateTimeFormat.format(new Date(iso))` sem guarda, então um único
 * registro com data em formato inesperado (mudança de serialização do banco,
 * um proxy, uma versão diferente da API) apaga a listagem inteira.
 *
 * É classe porque o React só oferece `componentDidCatch` e
 * `getDerivedStateFromError` nesta forma; não existe equivalente em hook.
 *
 * O limite fica em volta do conteúdo da rota, e não da aplicação inteira, de
 * propósito: a navegação continua montada, então quem topou com o erro troca
 * de tela em vez de ficar preso.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Sem isto o erro desapareceria: o React só o entrega aqui, e engoli-lo
    // trocaria uma tela branca por uma tela errada silenciosa — pior, porque
    // ninguém fica sabendo.
    this.props.onError?.(error, info)
    console.error('Erro não tratado durante o render:', error, info.componentStack)
  }

  private readonly reset = (): void => {
    this.setState({ error: null })
  }

  override render(): ReactNode {
    const { error } = this.state

    if (error === null) return this.props.children

    return (
      <div role="alert" className="error-state">
        <h2>Algo deu errado nesta tela</h2>
        <p>
          Não foi possível exibir o conteúdo. Você pode tentar de novo ou usar a navegação
          acima para ir a outra tela.
        </p>
        <button type="button" className="button" onClick={this.reset}>
          Tentar de novo
        </button>
      </div>
    )
  }
}
