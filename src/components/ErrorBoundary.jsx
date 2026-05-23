import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error, info) {
    console.error('UI_ERROR', {
      error,
      info,
      timestamp: new Date().toISOString(),
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            padding: 24,
            color: 'white',
            background: '#050505',
            minHeight: '100vh',
          }}
        >
          <h1>System Error</h1>

          <p>
            A terminal component crashed.
          </p>
        </div>
      );
    }

    return this.props.children;
  }
}
