import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  message: string
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error.message || 'Beklenmeyen bir hata oluştu.',
    }
  }

  componentDidCatch(_error: Error, _info: ErrorInfo): void {
    // Keep UI recoverable; avoid noisy console leftovers in production flows.
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="page" style={{ padding: '2rem' }}>
          <h1>Bir şeyler ters gitti</h1>
          <p className="muted">{this.state.message}</p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              this.setState({ hasError: false, message: '' })
              window.location.assign('/')
            }}
          >
            Ana sayfaya dön
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
