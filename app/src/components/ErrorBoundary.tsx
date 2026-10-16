import { Component, type ErrorInfo, type ReactNode } from 'react'
import { BugIcon, RotateCcwIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { errorText, log } from '../diag/log'

interface Props {
  /** where it sits, for the log ("page Lighting", "app") */
  where: string
  /** a new key (e.g. the page) starts over without the error */
  resetKey?: unknown
  /** the whole window: offers a reload instead of a retry */
  full?: boolean
  children: ReactNode
}

/**
 * Catches a rendering error so one broken page (or an unexpected byte from some keyboard) shows a message instead of a
 * blank window. The keyboard connection and the rest of the app keep working; the error goes to the diagnostic log.
 */
export class ErrorBoundary extends Component<Props, { error: Error | null; key: unknown }> {
  state = { error: null as Error | null, key: this.props.resetKey }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  static getDerivedStateFromProps(props: Props, state: { error: Error | null; key: unknown }) {
    // moving to another page clears the error
    return props.resetKey !== state.key ? { error: null, key: props.resetKey } : null
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    log.error('app', `${this.props.where} crashed: ${error.message}`, `${errorText(error)}\n${info.componentStack ?? ''}`)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className={this.props.full ? 'flex h-full items-center justify-center p-6' : 'p-2'}>
        <div className="mx-auto flex max-w-md flex-col gap-3 rounded-xl border bg-card p-5 text-sm">
          <span className="font-medium">{this.props.full ? 'FCC hit a problem' : 'This page hit a problem'}</span>
          <span className="text-muted-foreground">
            Nothing was sent to the keyboard because of it. The details are in Diagnostics → Log; a report with them helps get it fixed.
          </span>
          <code className="rounded-md bg-muted px-2 py-1.5 text-xs break-words">{this.state.error.message}</code>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => (this.props.full ? location.reload() : this.setState({ error: null }))}>
              <RotateCcwIcon data-icon="inline-start" />
              {this.props.full ? 'Reload' : 'Try again'}
            </Button>
            {!this.props.full && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => void import('./Diagnostics').then(({ useDiagnostics }) => useDiagnostics.getState().show('log'))}
              >
                <BugIcon data-icon="inline-start" />
                Diagnostics
              </Button>
            )}
          </div>
        </div>
      </div>
    )
  }
}
