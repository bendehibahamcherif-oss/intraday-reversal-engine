import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, componentStack: '' };
    this._reset = this._reset.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    const componentStack = info?.componentStack || '';
    this.setState({ componentStack });
    console.error('UI_ERROR', {
      message:        error?.message,
      stack:          error?.stack,
      componentStack,
      href:           typeof window !== 'undefined' ? window.location.href : '',
      timestamp:      new Date().toISOString(),
    });
  }

  _reset() {
    // Clear persisted state keys that could cause repeat crashes.
    try {
      const APP_KEYS = [
        'reversal-terminal-layout',
        'reversal-workspace',
        'reversal-active-symbol',
        'reversal-watchlist',
        'reversal-chart-config',
      ];
      APP_KEYS.forEach((k) => {
        try { localStorage.removeItem(k); } catch {}
      });
    } catch {}
    this.setState({ hasError: false, error: null, componentStack: '' });
    this.props.onReset?.();
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    // Scoped boundaries (e.g. a single workspace) may supply a compact inline
    // fallback so a child crash does not blank the entire terminal shell.
    if (this.props.fallback) {
      return typeof this.props.fallback === 'function'
        ? this.props.fallback({ error: this.state.error, reset: this._reset })
        : this.props.fallback;
    }

    const msg   = this.state.error?.message || 'Unknown error';
    const stack = this.state.componentStack;
    const isDev = typeof import.meta !== 'undefined' && import.meta.env?.DEV;

    return (
      <div style={{
        padding: 24,
        color: '#e5e7eb',
        background: '#050510',
        minHeight: '100vh',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}>
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <span style={{ fontSize: 20, color: '#ef4444' }}>⚠</span>
            <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>System Error</h1>
          </div>

          <p style={{ color: '#9ca3af', fontSize: 13, marginBottom: 16 }}>
            A terminal component crashed. Your session data is intact.
          </p>

          <div style={{
            background: '#0d0d1a',
            border: '1px solid #1f2937',
            borderRadius: 8,
            padding: 14,
            marginBottom: 16,
            fontFamily: 'monospace',
            fontSize: 12,
            color: '#ef4444',
            wordBreak: 'break-word',
          }}>
            {msg}
          </div>

          {isDev && stack && (
            <details style={{ marginBottom: 16 }}>
              <summary style={{ cursor: 'pointer', fontSize: 12, color: '#6b7280', marginBottom: 6 }}>
                Component stack (dev only)
              </summary>
              <pre style={{
                background: '#0d0d1a',
                border: '1px solid #1f2937',
                borderRadius: 8,
                padding: 12,
                fontSize: 10,
                color: '#9ca3af',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                maxHeight: 240,
                overflow: 'auto',
                margin: 0,
              }}>
                {stack}
              </pre>
            </details>
          )}

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              onClick={this._reset}
              style={{
                background: '#1d4ed8',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                padding: '10px 20px',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              ↺ Reset App State
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{
                background: 'transparent',
                color: '#9ca3af',
                border: '1px solid #374151',
                borderRadius: 8,
                padding: '10px 20px',
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              ⟳ Reload Page
            </button>
          </div>

          <p style={{ fontSize: 11, color: '#4b5563', marginTop: 20 }}>
            If this error repeats, click "Reset App State" to clear cached workspace data.
          </p>
        </div>
      </div>
    );
  }
}
