const btnStyle = {
  width: 20,
  height: 20,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'transparent',
  border: 'none',
  borderRadius: 2,
  color: 'var(--t-text-3)',
  cursor: 'pointer',
  fontSize: 11,
  padding: 0,
  lineHeight: 1,
  flexShrink: 0,
  transition: 'color 0.1s ease',
};

function ActionButton({ label, onClick, title }) {
  return (
    <button
      style={btnStyle}
      onClick={onClick}
      title={title}
      onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--t-text)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--t-text-3)'; }}
    >
      {label}
    </button>
  );
}

export default function PanelHeader({
  title,
  actions,
  onFullscreen,
  onCollapse,
  isFullscreen,
  badge,
  badgeColor,
  children,
}) {
  return (
    <div
      style={{
        height: 'var(--t-panel-header-h)',
        minHeight: 'var(--t-panel-header-h)',
        background: 'var(--t-bg-2)',
        borderBottom: '1px solid var(--t-border)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 8px',
        gap: 8,
        flexShrink: 0,
      }}
    >
      {/* Title */}
      <span
        style={{
          fontSize: 10,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--t-text-2)',
          whiteSpace: 'nowrap',
          userSelect: 'none',
        }}
      >
        {title}
      </span>

      {/* Optional Badge */}
      {badge && (
        <span
          style={{
            fontSize: 9,
            background: badgeColor ? undefined : 'var(--t-info-dim)',
            backgroundColor: badgeColor ? `${badgeColor}1F` : undefined,
            color: badgeColor || 'var(--t-info)',
            borderRadius: 2,
            padding: '1px 4px',
            userSelect: 'none',
          }}
        >
          {badge}
        </span>
      )}

      {/* Optional inline children (e.g. symbol pill) */}
      {children}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Custom action buttons */}
      {actions && actions.length > 0 && actions.map((action) => (
        <ActionButton
          key={action.key}
          label={action.label}
          onClick={action.onClick}
          title={action.title}
        />
      ))}

      {/* Collapse button */}
      {onCollapse && (
        <ActionButton
          label="−"
          onClick={onCollapse}
          title="Collapse panel"
        />
      )}

      {/* Fullscreen toggle */}
      {onFullscreen && (
        <ActionButton
          label={isFullscreen ? '⊡' : '⛶'}
          onClick={onFullscreen}
          title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        />
      )}
    </div>
  );
}
