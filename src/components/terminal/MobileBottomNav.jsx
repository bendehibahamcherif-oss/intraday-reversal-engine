import { useWorkspaceStore } from '../../store/workspaceStore.js';

const TABS = [
  { id: 'ChartOrderflow', label: 'CHART',   icon: '▤' },
  { id: 'Macro',          label: 'MARKETS', icon: '◎' },
  { id: 'Alerts',         label: 'ALERTS',  icon: '▲' },
  { id: 'MLEngine',       label: 'ML',      icon: '◆' },
  { id: 'Portfolio',      label: 'MORE',    icon: '⋯' },
];

export default function MobileBottomNav() {
  const workspace    = useWorkspaceStore((s) => s.workspace);
  const setWorkspace = useWorkspaceStore((s) => s.setWorkspace);

  return (
    <nav
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 200,
        height: 56,
        background: 'var(--t-bg-2)',
        borderTop: '1px solid var(--t-border)',
        display: 'flex',
      }}
    >
      {TABS.map((tab) => {
        const active = workspace === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => setWorkspace(tab.id)}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: active ? 'var(--t-info)' : 'var(--t-text-3)',
            }}
            title={tab.label}
          >
            <span style={{ fontSize: 16 }}>{tab.icon}</span>
            <span style={{
              fontSize: 9,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}>
              {tab.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
