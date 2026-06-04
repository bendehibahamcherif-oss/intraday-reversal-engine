export default function PanelContainer({
  title,
  children,
  actions = [],
  onFullscreen,
  isFullscreen = false,
  noPadding = false,
  style = {},
  headerChildren,
}) {
  return (
    <section
      style={{
        background: 'var(--t-bg-1)',
        border: '1px solid var(--t-border)',
        borderRadius: 2,
        display: 'flex',
        flexDirection: 'column',
        height: isFullscreen ? '100%' : 'auto',
        ...style,
      }}
    >
      {/* Header */}
      <div
        style={{
          height: 32,
          background: 'var(--t-bg-2)',
          borderBottom: '1px solid var(--t-border)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 8px',
          gap: 8,
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--t-text-2)',
          }}
        >
          {title}
        </span>

        {headerChildren}

        <div style={{ flex: 1 }} />

        {actions.map((action) => (
          <button
            key={action.label}
            onClick={action.onClick}
            title={action.title || action.label}
            style={{
              width: 20,
              height: 20,
              background: 'transparent',
              border: 'none',
              color: 'var(--t-text-3)',
              cursor: 'pointer',
              borderRadius: 2,
              fontSize: 11,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--t-text)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--t-text-3)'; }}
          >
            {action.label}
          </button>
        ))}

        {onFullscreen && (
          <button
            onClick={onFullscreen}
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            style={{
              width: 20,
              height: 20,
              background: 'transparent',
              border: 'none',
              color: 'var(--t-text-3)',
              cursor: 'pointer',
              borderRadius: 2,
              fontSize: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--t-text)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--t-text-3)'; }}
          >
            {isFullscreen ? '⊡' : '⛶'}
          </button>
        )}
      </div>

      {/* Content */}
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          padding: noPadding ? 0 : 12,
        }}
      >
        {children}
      </div>
    </section>
  );
}
