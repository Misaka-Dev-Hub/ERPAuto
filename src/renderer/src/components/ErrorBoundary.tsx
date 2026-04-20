import React from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'

interface ErrorBoundaryProps {
  children: React.ReactNode
  /** Optional label identifying the boundary scope (e.g. "App", "AuthenticatedShell") */
  scope?: string
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

/**
 * React Error Boundary that catches rendering errors in child components,
 * logs the full error + component stack to the main process logger,
 * and displays a fallback UI.
 *
 * Cannot use hooks (React constraint), so calls window.electron.logger directly.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    const scope = this.props.scope || 'Unknown'

    // Log to main process via IPC logger
    try {
      if (typeof window !== 'undefined' && window.electron?.logger?.log) {
        window.electron.logger.log('error', `Render error in <${scope}>`, {
          error: {
            name: error.name,
            message: error.message,
            stack: error.stack
          },
          componentStack: errorInfo.componentStack,
          boundaryScope: scope
        })
      }
    } catch {
      // Logging failed — don't make things worse
    }

  }

  handleReload = (): void => {
    this.setState({ hasError: false, error: null })
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-slate-50 p-8">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-lg">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-rose-100">
              <AlertTriangle size={28} className="text-rose-600" />
            </div>
            <h2 className="mb-2 text-xl font-bold text-slate-800">页面出现错误</h2>
            <p className="mb-4 text-sm text-slate-500">
              应用发生了未预期的错误，请尝试刷新页面。如果问题持续存在，请联系管理员。
            </p>
            <details className="mb-6 text-left">
              <summary className="cursor-pointer text-xs text-slate-400 hover:text-slate-600">
                错误详情
              </summary>
              <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-slate-100 p-3 text-xs text-slate-700">
                {this.state.error?.message}
              </pre>
            </details>
            <button
              onClick={this.handleReload}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700"
            >
              <RotateCcw size={16} />
              刷新页面
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
