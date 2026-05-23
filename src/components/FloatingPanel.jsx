import { useState } from 'react';

export default function FloatingPanel({
  title,
  children,
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div
      style={{
        background: '#0b0b0b',
        border: '1px solid #202020',
        borderRadius: 14,
        overflow: 'hidden',
        marginBottom: 16,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: 12,
          borderBottom: '1px solid #202020',
        }}
      >
        <strong>{title}</strong>

        <button
          onClick={() =>
            setCollapsed((v) => !v)
          }
        >
          {collapsed ? 'Open' : 'Collapse'}
        </button>
      </div>

      {!collapsed && (
        <div style={{ padding: 12 }}>
          {children}
        </div>
      )}
    </div>
  );
}
