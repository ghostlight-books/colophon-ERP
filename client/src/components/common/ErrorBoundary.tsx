import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string | null;
}

// Catches any uncaught render/effect error in the tree below it. Without
// this, React's default behavior is to unmount the entire app on an
// uncaught error, leaving a blank screen with no way back short of force-
// closing and reopening -- this gives the user a recoverable screen instead.
export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, message: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { hasError: true, message: error instanceof Error ? error.message : "An unexpected error occurred." };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error("Unhandled UI error:", error, info.componentStack);
  }

  handleGoHome = (): void => {
    window.location.href = "/";
  };

  handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 z-[999999] bg-slate-950 text-white flex flex-col items-center justify-center gap-4 p-6 text-center font-sans">
          <span className="text-4xl">⚠️</span>
          <h1 className="text-lg font-black">Something went wrong</h1>
          <p className="text-sm text-slate-400 max-w-sm">{this.state.message}</p>
          <div className="flex items-center gap-3 mt-2">
            <button
              type="button"
              onClick={this.handleGoHome}
              className="px-5 py-2.5 bg-white text-slate-900 font-bold text-sm rounded-xl cursor-pointer"
            >
              ← Go Home
            </button>
            <button
              type="button"
              onClick={this.handleReload}
              className="px-5 py-2.5 bg-slate-800 text-white font-bold text-sm rounded-xl cursor-pointer border border-slate-700"
            >
              Reload App
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
