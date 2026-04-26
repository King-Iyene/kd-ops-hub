import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * Catches uncaught render / lifecycle errors anywhere below it in the tree
 * and shows a recoverable error card instead of letting React unmount the
 * whole app. Use one near the root (around <Outlet />) to scope blast
 * radius to a single page rather than the entire SPA.
 *
 * Note: does NOT catch errors in async callbacks (event handlers, promises).
 * Those still need their own try/catch + toast.
 */

interface Props {
  children: ReactNode;
  /** Optional: shown above the action buttons. Useful for telling the user
   *  what they were doing when it broke. */
  context?: string;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Log to the console — when Sentry is wired up later, replace with
    // Sentry.captureException(error, { extra: { componentStack: info.componentStack } });
    console.error('[KDOps] ErrorBoundary caught:', error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <Card className="w-full max-w-lg border-destructive/30">
          <CardHeader className="pb-3 border-b">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Something went wrong on this page
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 space-y-4 text-sm">
            <p className="text-muted-foreground leading-relaxed">
              {this.props.context
                ? `${this.props.context} `
                : ''}
              The rest of the app is still working — the error is contained
              to this page only.
            </p>
            <div className="rounded-lg bg-muted/50 px-3 py-2 font-mono text-xs break-all">
              {this.state.error.message || 'Unknown error'}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={this.reset} size="sm">
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Try again
              </Button>
              <Button onClick={() => (window.location.href = '/')} variant="outline" size="sm">
                <Home className="h-3.5 w-3.5 mr-1.5" /> Go to dashboard
              </Button>
              <Button
                onClick={() => window.location.reload()}
                variant="ghost"
                size="sm"
              >
                Reload page
              </Button>
            </div>
            <p className="text-xs text-muted-foreground/70 border-t pt-2">
              If this keeps happening, please copy the error above and share
              it with support.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }
}
