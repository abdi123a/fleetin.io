import { AlertTriangle } from '@/design-system/icons';

import { Component, type ErrorInfo, type ReactNode } from 'react';

import { Button, IconChip } from '@/design-system';
import { ENV } from '@/config/app';

/**
 * ErrorBoundary — catches render-time errors in a subtree.
 *
 * Must remain a class component: React exposes no hook equivalent of
 * `componentDidCatch`. Mounted around the router in `AppProviders`, and
 * available for wrapping individual feature panels so one broken widget cannot
 * blank the whole page.
 */

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Custom fallback. Receives the error and a reset callback. */
  fallback?: (error: Error, reset: () => void) => ReactNode;
  /** Reporting hook — wire to the observability provider in Phase 2. */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.props.onError?.(error, errorInfo);

    if (ENV.isDevelopment) {
      console.error('[ErrorBoundary]', error, errorInfo.componentStack);
    }
  }

  private readonly reset = (): void => {
    const isChunkError =
      this.state.error?.message?.includes('dynamically imported module') ||
      this.state.error?.message?.includes('Failed to fetch');

    if (isChunkError) {
      window.location.reload();
    } else {
      this.setState({ error: null });
    }
  };

  override render(): ReactNode {
    const { error } = this.state;
    const { children, fallback } = this.props;

    if (!error) return children;
    if (fallback) return fallback(error, this.reset);

    return (
      <div
        role="alert"
        className="flex flex-1 min-h-64 flex-col items-center justify-center gap-4 p-8 text-center"
      >
        <IconChip icon={AlertTriangle} tint="red" />

        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-foreground">Something went wrong</h2>
          <p className="max-w-md text-sm text-muted-foreground">
            An unexpected error occurred while rendering this view. Try again, and contact the
            platform team if the problem persists.
          </p>
        </div>

        {ENV.isDevelopment && (
          <pre className="max-w-full overflow-x-auto rounded-md bg-surface-sunken p-3 text-left text-xs text-destructive">
            {error.message}
          </pre>
        )}

        <Button variant="outline" onClick={this.reset}>
          Try again
        </Button>
      </div>
    );
  }
}
