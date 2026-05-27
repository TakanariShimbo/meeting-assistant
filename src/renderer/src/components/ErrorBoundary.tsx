import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  /** Short label used in the fallback UI + console log */
  label: string
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * Catches render crashes in its children and shows a small fallback box
 * instead of letting the exception unmount the surrounding panel — which is
 * what made the analysis area "go black" when the model returned a malformed
 * field shape that crashed a downstream component.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(
      `[ErrorBoundary:${this.props.label}] render crash`,
      error,
      info.componentStack
    )
  }

  reset = (): void => this.setState({ error: null })

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="render-error">
          <strong>{this.props.label} の表示でエラー</strong>
          <p>{this.state.error.message}</p>
          <button type="button" onClick={this.reset}>
            リトライ
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
