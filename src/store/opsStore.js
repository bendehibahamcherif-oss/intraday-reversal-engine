import { create } from 'zustand';
import { api } from '../api.js';

const POLL_INTERVAL_MS = 15_000;

function clientSessionState() {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map(p => [p.type, p.value]));
  const weekday = parts.weekday;
  const h = parseInt(parts.hour, 10);
  const m = parseInt(parts.minute, 10);
  const mins = h * 60 + m;
  const isWeekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].includes(weekday);
  const isOpen = isWeekday && mins >= 570 && mins < 960; // 09:30–16:00
  const etTime = fmt.format(now);
  let state = 'WEEKEND';
  if (isWeekday) {
    if (mins < 570) state = 'PRE_MARKET';
    else if (mins < 960) state = 'OPEN';
    else state = 'AFTER_HOURS';
  }
  return { state, isOpen, etTime, weekday };
}

export const useOpsStore = create((set, get) => ({
  status: null,
  statusLoading: false,
  statusError: '',
  lastFetched: null,
  clientSession: clientSessionState(),
  _pollTimer: null,

  loadStatus: async () => {
    set({ statusLoading: true, statusError: '' });
    try {
      const data = await api.getOpsStatus();
      set({ status: data, statusLoading: false, lastFetched: Date.now() });
    } catch (err) {
      set({ statusLoading: false, statusError: err.message || 'Failed to load ops status' });
    }
  },

  refreshClientSession: () => {
    set({ clientSession: clientSessionState() });
  },

  startPolling: () => {
    const { _pollTimer, loadStatus, refreshClientSession } = get();
    if (_pollTimer) return;
    loadStatus();
    const timer = setInterval(() => {
      loadStatus();
      refreshClientSession();
    }, POLL_INTERVAL_MS);
    set({ _pollTimer: timer });
  },

  stopPolling: () => {
    const { _pollTimer } = get();
    if (_pollTimer) clearInterval(_pollTimer);
    set({ _pollTimer: null });
  },
}));
