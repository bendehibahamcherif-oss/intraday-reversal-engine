import { useEffect } from 'react';
import { getDesktopWorkspaces, getWorkspace } from './config/workspaces.js';
import { useWorkspaceStore } from './store/workspaceStore.js';
import { useMLSignalStore } from './store/mlSignalStore.js';

export default function TerminalSidebar({ watchlist = [], socketStatus = 'unknown', onSelectSymbol }) {
  const workspace    = useWorkspaceStore((s) => s.workspace);
  const setWorkspace = useWorkspaceStore((s) => s.setWorkspace);
  const mlStore      = useMLSignalStore();
  const navItems     = getDesktopWorkspaces();
  const settingsItem  = getWorkspace('Settings');
  const renderSettingsShortcut = !navItems.some((item) => item.id === settingsItem.id);

  // Load ML signals for all watchlist symbols
  useEffect(() => {
    for (const sym of watchlist) mlStore.loadSignal(sym);
  }, [watchlist.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  function navButtonStyle(active, disabled = false) {
    return {
      width: 40,
      height: 40,
      margin: '2px auto',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 3,
      background: active ? 'var(--t-accent)' : 'transparent',
      color: disabled ? 'var(--t-text-4)' : active ? 'white' : 'var(--t-text-3)',
      border: active ? '1px solid var(--t-accent-hover)' : '1px solid transparent',
      fontSize: 10,
      fontWeight: 700,
      fontFamily: 'monospace',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.55 : 1,
      position: 'relative',
    };
  }

  return (
    <aside
      data-testid="desktop-workspace-nav"
      style={{
        width: 48,
        background: 'var(--t-bg-2)',
        borderRight: '1px solid var(--t-border)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
        position: 'relative',
        flexShrink: 0,
      }}
    >
      {/* Logo */}
      <div
        style={{
          width: 48,
          height: 48,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 16,
          fontWeight: 900,
          color: 'var(--t-accent)',
          flexShrink: 0,
        }}
        title="Reversal Terminal"
      >
        R
      </div>

      {/* Nav items */}
      <nav
        style={{
          flex: 1,
          overflowY: 'auto',
          scrollbarWidth: 'none',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {navItems.map((item) => {
          const active = workspace === item.id;
          const tooltip = item.implemented ? item.label : `${item.label} (coming soon)`;
          const ariaLabel = item.implemented ? item.ariaLabel : `${item.ariaLabel} (coming soon)`;
          return (
            <button
              key={item.id}
              onClick={() => item.implemented && setWorkspace(item.id)}
              disabled={!item.implemented}
              style={navButtonStyle(active, !item.implemented)}
              data-testid={item.navTestId}
              data-tooltip={tooltip}
              title={tooltip}
              aria-label={ariaLabel}
              onMouseEnter={(e) => {
                if (!active && item.implemented) {
                  e.currentTarget.style.background = 'var(--t-bg-hover)';
                }
              }}
              onMouseLeave={(e) => {
                if (!active && item.implemented) {
                  e.currentTarget.style.background = 'transparent';
                }
              }}
            >
              {item.shortLabel}
            </button>
          );
        })}
      </nav>

      {/* Bottom section: only render a legacy Settings shortcut when the canonical
          Operations workspace is not already present in the desktop registry. */}
      {renderSettingsShortcut && (
        <div style={{ flexShrink: 0 }}>
          <div style={{ borderTop: '1px solid var(--t-border)', margin: '4px 0' }} />
          <button
            onClick={() => setWorkspace(settingsItem.id)}
            style={navButtonStyle(workspace === settingsItem.id)}
            data-testid={settingsItem.navTestId}
            data-tooltip={settingsItem.label}
            title={settingsItem.label}
            aria-label={settingsItem.ariaLabel}
            onMouseEnter={(e) => {
              if (workspace !== settingsItem.id) {
                e.currentTarget.style.background = 'var(--t-bg-hover)';
              }
            }}
            onMouseLeave={(e) => {
              if (workspace !== settingsItem.id) {
                e.currentTarget.style.background = 'transparent';
              }
            }}
          >
            {settingsItem.shortLabel}
          </button>
        </div>
      )}
    </aside>
  );
}
