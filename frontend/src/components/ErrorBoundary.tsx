import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

/**
 * Stops one broken panel taking the whole page with it.
 *
 * Without this, a single render error - a field the API did not send, a null
 * where an array was expected - unmounts the entire React tree and the officer
 * sees a blank white screen with no idea what happened. That is exactly what a
 * stale backend caused: it returned tutor replies with no `sources` array, the
 * tutor read `.length` on undefined, and the whole application went blank.
 */
export class ErrorBoundary extends Component<
  { children: ReactNode; label?: string },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep it in the console for whoever is debugging; the panel below is for
    // the officer, who cannot act on a stack trace.
    console.error("Panel crashed:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <p className="font-medium">
            {this.props.label ?? "This panel"} could not be displayed.
          </p>
          <p className="mt-1 text-xs">
            The rest of the page still works. If this persists, the app and the server
            may be running different versions — restarting the server usually fixes it.
          </p>
          <button
            onClick={() => this.setState({ error: null })}
            className="mt-3 rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-medium text-rose-800 hover:bg-rose-100"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
