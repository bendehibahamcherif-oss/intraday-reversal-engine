import { useState } from 'react';
import { useWorkspaceStore } from '../../store/workspaceStore.js';
import { WORKSPACES, MOBILE_PRIMARY_TAB_IDS, MOBILE_MORE_WORKSPACES } from '../../config/workspaces.js';

const PRIMARY_TABS = WORKSPACES.filter((w) => MOBILE_PRIMARY_TAB_IDS.includes(w.id));

export default function MobileBottomNav() {
  const workspace    = useWorkspaceStore((s) => s.workspace);
  const setWorkspace = useWorkspaceStore((s) => s.setWorkspace);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const moreActive = !MOBILE_PRIMARY_TAB_IDS.includes(workspace);

  function handleSelect(id) {
    setWorkspace(id);
    setDrawerOpen(false);
  }

  return (
    <>
      {/* More drawer */}
      {drawerOpen && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setDrawerOpen(false)}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 190,
              background: 'rgba(0,0,0,0.55)',
            }}
          />
          {/* Drawer panel */}
          <div
            data-testid="more-drawer"
            style={{
              position: 'fixed',
              bottom: 56,
              left: 0,
              right: 0,
              zIndex: 195,
              background: 'var(--t-bg-2)',
              borderTop: '1px solid var(--t-border)',
              maxHeight: '60vh',
              overflowY: 'auto',
            }}
          >
            <div style={{ padding: '8px 12px 4px', fontSize: 9, fontWeight: 700, color: 'var(--t-text-3)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              All Workspaces
            </div>
            {MOBILE_MORE_WORKSPACES.map((ws) => {
              const active = workspace === ws.id;
              return (
                <button
                  key={ws.id}
                  data-testid={`more-item-${ws.id}`}
                  onClick={() => handleSelect(ws.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    width: '100%',
                    padding: '10px 16px',
                    background: active ? 'var(--t-accent)' : 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: active ? 'white' : 'var(--t-text-1)',
                    textAlign: 'left',
                    fontSize: 13,
                  }}
                >
                  <span style={{ fontSize: 16, minWidth: 20 }}>{ws.icon}</span>
                  <span>{ws.label}</span>
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* Bottom nav bar */}
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
        {PRIMARY_TABS.map((tab) => {
          const active = workspace === tab.id;
          return (
            <button
              key={tab.id}
              data-testid={`mobile-tab-${tab.id}`}
              onClick={() => { setDrawerOpen(false); setWorkspace(tab.id); }}
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
              <span style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {tab.shortLabel}
              </span>
            </button>
          );
        })}

        {/* More button */}
        <button
          data-testid="mobile-tab-more"
          onClick={() => setDrawerOpen((o) => !o)}
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
            color: moreActive || drawerOpen ? 'var(--t-info)' : 'var(--t-text-3)',
          }}
          title="More workspaces"
        >
          <span style={{ fontSize: 16 }}>⋯</span>
          <span style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            MORE
          </span>
        </button>
      </nav>
    </>
  );
}
