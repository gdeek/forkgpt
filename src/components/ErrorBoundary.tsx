import React from 'react'

type State = { hasError: boolean; message?: string }

export class ErrorBoundary extends React.Component<React.PropsWithChildren<{}>, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(error: any): State {
    return { hasError: true, message: error?.message || String(error) }
  }

  componentDidCatch(error: any, info: any) {
    // eslint-disable-next-line no-console
    console.error('ErrorBoundary caught', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-3 text-sm text-red-700 bg-red-50 dark:bg-red-950/30 border-t border-red-200 dark:border-red-900">
          Something went wrong: {this.state.message}
        </div>
      )
    }
    return this.props.children
  }
}
