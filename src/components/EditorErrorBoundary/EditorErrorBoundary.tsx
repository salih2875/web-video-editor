import { Component, type ErrorInfo, type ReactNode } from "react";
import styles from "./EditorErrorBoundary.module.css";

interface EditorErrorBoundaryProps {
  children: ReactNode;
}

interface EditorErrorBoundaryState {
  error: Error | null;
}

export class EditorErrorBoundary extends Component<
  EditorErrorBoundaryProps,
  EditorErrorBoundaryState
> {
  public override state: EditorErrorBoundaryState = { error: null };

  public static getDerivedStateFromError(error: Error): EditorErrorBoundaryState {
    return { error };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error("The editor encountered an unrecoverable render error.", error, errorInfo);
  }

  public override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <main className={styles.fallback} role="alert">
        <div className={styles.card}>
          <h1>The editor could not continue</h1>
          <p>Your autosaved project is still stored in this browser.</p>
          <pre>{error.message || "An unexpected error occurred."}</pre>
          <button type="button" onClick={() => window.location.reload()}>
            Reload editor
          </button>
        </div>
      </main>
    );
  }
}
