import { useAlertStore } from '../store/alertStore.js';

const CONTAINER = {
  position: 'fixed',
  bottom: 24,
  right: 24,
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  zIndex: 9999,
  pointerEvents: 'none',
};

const TOAST = {
  background: '#1a1a2e',
  border: '1px solid #FFB800',
  borderRadius: 10,
  padding: '12px 16px',
  minWidth: 260,
  maxWidth: 360,
  boxShadow: '0 4px 24px rgba(0,0,0,0.6)',
  pointerEvents: 'auto',
  display: 'flex',
  alignItems: 'flex-start',
  gap: 10,
  animation: 'vpToastIn 0.2s ease',
};

function formatType(t) {
  return String(t || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmtPrice(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(2) : '—';
}

export default function AlertToast() {
  const toasts = useAlertStore((s) => s.toasts);
  const dismiss = useAlertStore((s) => s.dismissToast);

  if (!toasts.length) return null;

  return (
    <>
      <style>{`
        @keyframes vpToastIn {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <div style={CONTAINER}>
        {toasts.map((t) => (
          <div key={t.id} style={TOAST}>
            <span style={{ fontSize: 18, lineHeight: 1 }}>🔔</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, color: '#FFB800', fontSize: 13 }}>
                {t.symbol} — {formatType(t.type)}
              </div>
              <div style={{ color: '#e0e0f0', fontSize: 12, marginTop: 3 }}>
                {t.reason || `Triggered at ${fmtPrice(t.triggerValue)}`}
              </div>
            </div>
            <button
              onClick={() => dismiss(t.id)}
              style={{ background: 'none', border: 'none', color: '#8080a0', cursor: 'pointer', fontSize: 16, padding: 0, lineHeight: 1 }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
