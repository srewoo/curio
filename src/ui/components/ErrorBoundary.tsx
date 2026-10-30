import { Component, type ErrorInfo, type ReactNode } from 'react';

// Last line of defence: a render error shows a friendly recovery screen
// instead of a blank window. Saved chapters are untouched (they live in
// encrypted storage), so reloading is always safe.
interface State {
  readonly error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[Curio] UI crashed:', error, info.componentStack);
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-full bg-shell py-16 px-5" role="alert">
        <div className="max-w-md mx-auto curio-card p-6 text-center">
          <p className="text-lg font-medium mb-1">Oops — Curio hit a snag.</p>
          <p className="text-sm text-ink-2 mb-4">Your saved chapters and progress are safe. Reloading usually fixes it.</p>
          <button className="curio-btn curio-btn-primary" onClick={() => location.reload()}>Reload Curio</button>
        </div>
      </div>
    );
  }
}
