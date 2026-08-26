type SentryGlobal = {
  captureException?: (e: unknown) => void;
  captureMessage?: (msg: string, level?: string) => void;
};

const sentry = (): SentryGlobal | undefined =>
  (window as unknown as { Sentry?: SentryGlobal }).Sentry;

export function logWarn(tag: string, message: string, extra?: unknown): void {
  console.warn(`[${tag}]`, message, ...(extra !== undefined ? [extra] : []));
  sentry()?.captureMessage?.(`[${tag}] ${message}`, 'warning');
}

export function logError(tag: string, message: string, error?: unknown): void {
  console.error(`[${tag}]`, message, ...(error !== undefined ? [error] : []));
  if (error instanceof Error) {
    sentry()?.captureException?.(error);
  } else {
    sentry()?.captureMessage?.(`[${tag}] ${message}`, 'error');
  }
}
