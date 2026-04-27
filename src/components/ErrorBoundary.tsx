import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Props {
  children: ReactNode;
  context?: string;
  fallback?: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  private static isChunkError(error: Error): boolean {
    return (
      error.message.includes('Failed to fetch dynamically imported module') ||
      error.message.includes('Importing a module script failed') ||
      error.name === 'ChunkLoadError'
    );
  }

  static getDerivedStateFromError(error: Error): State {
    if (ErrorBoundary.isChunkError(error)) {
      const key = 'kdops_chunk_reload';
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, '1');
        window.location.reload();
        return { error: null };
      }
    }
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[KDOps] ErrorBoundary caught:', error, info.componentStack);
    type SentryGlobal = { captureException?: (e: unknown, ctx?: unknown) => void };
    const s = (window as unknown as { Sentry?: SentryGlobal }).Sentry;
    s?.captureException?.(error, { extra: { componentStack: info.componentStack } });
  }

  componentDidMount() {
    sessionStorage.removeItem('kdops_chunk_reload');
  }

  reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;

    if (this.props.fallback) return this.props.fallback;

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
              {this.props.context ? `${this.props.context} ` : ''}
              The rest of the app is still working — the error is contained to this page only.
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
              <Button onClick={() => window.location.reload()} variant="ghost" size="sm">
                Reload page
              </Button>
            </div>
            <p className="text-xs text-muted-foreground/70 border-t pt-2">
              If this keeps happening, please copy the error above and share it with support.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }
}
