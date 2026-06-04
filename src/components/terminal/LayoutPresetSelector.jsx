import { useTerminalLayoutStore } from '../../store/terminalLayoutStore.js';

const PRESETS = [
  { id: 'default',    icon: '⊞', label: 'Default' },
  { id: 'chart-only', icon: '⬜', label: 'Chart Only' },
  { id: '2-chart',    icon: '⊟', label: '2-Panel' },
  { id: '4-chart',    icon: '⊡', label: '4-Chart' },
];

export default function LayoutPresetSelector() {
  const layoutPreset = useTerminalLayoutStore((s) => s.layoutPreset);
  const setPreset    = useTerminalLayoutStore((s) => s.setPreset);
  const resetLayout  = useTerminalLayoutStore((s) => s.resetLayout);

  function buttonStyle(active) {
    return {
      height: 28,
      padding: '0 10px',
      borderRadius: 2,
      fontSize: 10,
      fontWeight: 600,
      cursor: 'pointer',
      background: active ? 'var(--t-accent)' : 'transparent',
      color: active ? 'white' : 'var(--t-text-3)',
      border: active ? '1px solid var(--t-accent)' : '1px solid var(--t-border)',
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      whiteSpace: 'nowrap',
    };
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
      {PRESETS.map((p) => (
        <button
          key={p.id}
          onClick={() => setPreset(p.id)}
          style={buttonStyle(layoutPreset === p.id)}
          title={`Set layout: ${p.label}`}
        >
          <span>{p.icon}</span>
          <span>{p.label}</span>
        </button>
      ))}
      <button
        onClick={() => resetLayout()}
        style={buttonStyle(false)}
        title="Reset layout to defaults"
      >
        Reset Layout
      </button>
    </div>
  );
}
