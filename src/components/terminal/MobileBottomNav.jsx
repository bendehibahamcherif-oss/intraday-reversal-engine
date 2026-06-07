import { useMemo, useState } from 'react';
import { getMobileMoreWorkspaces, getMobilePrimaryWorkspaces } from '../../config/workspaces.js';
import { useWorkspaceStore } from '../../store/workspaceStore.js';

export default function MobileBottomNav() {
  const [moreOpen, setMoreOpen] = useState(false);
  const workspace    = useWorkspaceStore((s) => s.workspace);
  const setWorkspace = useWorkspaceStore((s) => s.setWorkspace);
  const primaryTabs  = useMemo(() => getMobilePrimaryWorkspaces(), []);
  const moreItems    = useMemo(() => getMobileMoreWorkspaces(), []);
  const moreActive   = moreItems.some((item) => item.id === workspace);

  const selectWorkspace = (workspaceId) => {
    setWorkspace(workspaceId);
    setMoreOpen(false);
  };

  const tabs = [
    ...primaryTabs,
    { id: 'MoreMenu', label: 'More', ariaLabel: 'More workspaces', navTestId: 'mobile-more-workspaces', shortLabel: 'MORE', icon: '⋯', isMore: true },
  ];

  return (
    <>
      {moreOpen && (
        <div
          role="presentation"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 190,
            background: 'rgba(0,0,0,0.38)',
          }}
          onClick={() => setMoreOpen(false)}
        >
          <section
            role="dialog"
            aria-label="More workspaces"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 56,
              maxHeight: '65dvh',
              overflowY: 'auto',
              WebkitOverflowScrolling: 'touch',
              background: 'var(--t-bg-2)',
              borderTop: '1px solid var(--t-border)',
              boxShadow: '0 -18px 40px rgba(0,0,0,0.45)',
            }}
          >
            <div style={{
              position: 'sticky',
              top: 0,
              zIndex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 12px',
              background: 'var(--t-bg-2)',
              borderBottom: '1px solid var(--t-border)',
            }}>
              <strong style={{ fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--t-text)' }}>
                More Workspaces
              </strong>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                aria-label="Close more workspaces"
                style={{
                  minWidth: 44,
                  minHeight: 36,
                  background: 'transparent',
                  border: '1px solid var(--t-border)',
                  color: 'var(--t-text-2)',
                  borderRadius: 4,
                  cursor: 'pointer',
                }}
              >
                ×
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', padding: '6px 0 10px' }}>
              {moreItems.map((item) => {
                const active = workspace === item.id;
                return (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => item.implemented && selectWorkspace(item.id)}
                    disabled={!item.implemented}
                    data-testid={item.navTestId}
                    aria-label={item.ariaLabel}
                    aria-current={active ? 'page' : undefined}
                    style={{
                      minHeight: 48,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '0 14px',
                      background: active ? 'var(--t-bg-hover)' : 'transparent',
                      border: 'none',
                      borderLeft: active ? '3px solid var(--t-info)' : '3px solid transparent',
                      color: item.implemented ? active ? 'var(--t-info)' : 'var(--t-text-2)' : 'var(--t-text-4)',
                      cursor: item.implemented ? 'pointer' : 'not-allowed',
                      textAlign: 'left',
                      opacity: item.implemented ? 1 : 0.55,
                    }}
                  >
                    <span style={{ width: 22, textAlign: 'center', fontSize: 14 }}>{item.icon}</span>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: active ? 700 : 600 }}>
                      {item.label}
                    </span>
                    {!item.implemented && (
                      <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        Soon
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      )}

      <nav
        aria-label="Mobile workspace navigation"
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
        {tabs.map((tab) => {
          const active = tab.isMore ? moreOpen || moreActive : workspace === tab.id;
          return (
            <button
              type="button"
              key={tab.id}
              onClick={() => tab.isMore ? setMoreOpen((open) => !open) : selectWorkspace(tab.id)}
              data-testid={tab.navTestId}
              aria-label={tab.ariaLabel}
              aria-expanded={tab.isMore ? moreOpen : undefined}
              aria-haspopup={tab.isMore ? 'dialog' : undefined}
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
                {tab.shortLabel ?? tab.label}
              </span>
            </button>
          );
        })}
      </nav>
    </>
  );
}
