import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useCommandPaletteStore } from '../../store/commandPaletteStore.js';
import { useWorkspaceStore } from '../../store/workspaceStore.js';
import { useActiveSymbolStore } from '../../store/activeSymbolStore.js';
import { useChartStore } from '../../store/chartStore.js';
import { useTerminalLayoutStore } from '../../store/terminalLayoutStore.js';
import { getDesktopWorkspaces } from '../../config/workspaces.js';

const WORKSPACES = getDesktopWorkspaces();

const TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1d'];
const QUICK_SYMBOLS = ['SPY', 'QQQ', 'BTC-USD', 'ETH-USD', 'EURUSD=X', 'GLD', 'TLT'];

function fuzzyMatch(query, label) {
  if (!query) return true;
  const q = query.toLowerCase();
  const l = label.toLowerCase();
  let qi = 0;
  for (let i = 0; i < l.length && qi < q.length; i++) {
    if (l[i] === q[qi]) qi++;
  }
  return qi === q.length;
}

export default function CommandPalette() {
  const open         = useCommandPaletteStore((s) => s.open);
  const closePalette = useCommandPaletteStore((s) => s.closePalette);

  const setWorkspace = useWorkspaceStore((s) => s.setWorkspace);
  const setSymbol    = useActiveSymbolStore((s) => s.setSymbol);
  const setTimeframe = useChartStore((s) => s.setTimeframe);
  const refreshChart = useChartStore((s) => s.refreshChart);
  const resetLayout  = useTerminalLayoutStore((s) => s.resetLayout);
  const setPreset    = useTerminalLayoutStore((s) => s.setPreset);

  const [query, setQuery]               = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const listRef  = useRef(null);

  const close = useCallback(() => {
    closePalette();
    setQuery('');
    setSelectedIndex(0);
  }, [closePalette]);

  const commands = useMemo(() => [
    ...WORKSPACES.map((w) => ({
      id: `ws:${w.id}`,
      group: 'WORKSPACE',
      label: `Open ${w.label}`,
      searchText: `Open ${w.label} ${(w.aliases ?? []).join(' ')}`,
      hint: w.id,
      action: () => { if (w.implemented) setWorkspace(w.id); close(); },
    })),
    ...QUICK_SYMBOLS.map((s) => ({
      id: `sym:${s}`,
      group: 'SYMBOL',
      label: `Switch to ${s}`,
      hint: s,
      action: () => { setSymbol(s); close(); },
    })),
    ...TIMEFRAMES.map((tf) => ({
      id: `tf:${tf}`,
      group: 'TIMEFRAME',
      label: `Set timeframe ${tf}`,
      hint: tf,
      action: () => { setTimeframe(tf); close(); },
    })),
    {
      id: 'action:refresh',
      group: 'ACTION',
      label: 'Refresh Chart',
      hint: 'R',
      action: () => { refreshChart(); close(); },
    },
    {
      id: 'action:reset-layout',
      group: 'ACTION',
      label: 'Reset Layout',
      hint: '',
      action: () => { resetLayout(); close(); },
    },
    {
      id: 'action:chart-only',
      group: 'LAYOUT',
      label: 'Layout: Chart Only',
      hint: '',
      action: () => { setPreset('chart-only'); close(); },
    },
    {
      id: 'action:default-layout',
      group: 'LAYOUT',
      label: 'Layout: Default (4-panel)',
      hint: '',
      action: () => { setPreset('default'); close(); },
    },
  ], [setWorkspace, setSymbol, setTimeframe, refreshChart, resetLayout, setPreset, close]);

  const filtered = useMemo(() => {
    return commands.filter((cmd) => fuzzyMatch(query, cmd.searchText ?? cmd.label)).slice(0, 20);
  }, [commands, query]);

  // Group filtered results
  const grouped = useMemo(() => {
    const groups = {};
    const order = [];
    for (const cmd of filtered) {
      if (!groups[cmd.group]) {
        groups[cmd.group] = [];
        order.push(cmd.group);
      }
      groups[cmd.group].push(cmd);
    }
    return { groups, order };
  }, [filtered]);

  // Reset state when opened
  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const selected = listRef.current.querySelector('[data-selected="true"]');
      if (selected) selected.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  // Global Ctrl+K listener
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        if (open) {
          close();
        } else {
          useCommandPaletteStore.getState().openPalette();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, close]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const cmd = filtered[selectedIndex];
      if (cmd) cmd.action();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  }, [filtered, selectedIndex, close]);

  if (!open) return null;

  // Build flat index map for rendering
  let flatIndex = 0;
  const rows = [];
  for (const group of grouped.order) {
    rows.push({ type: 'header', group, key: `header-${group}` });
    for (const cmd of grouped.groups[group]) {
      rows.push({ type: 'cmd', cmd, index: flatIndex, key: cmd.id });
      flatIndex++;
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        zIndex: 9000,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: 120,
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        style={{
          width: 560,
          maxWidth: '90vw',
          background: 'var(--t-bg-2)',
          border: '1px solid var(--t-border)',
          borderRadius: 4,
          overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <input
          ref={inputRef}
          type="text"
          placeholder="Type a command, symbol, or workspace..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          style={{
            width: '100%',
            height: 44,
            background: 'var(--t-bg-1)',
            border: 'none',
            borderBottom: '1px solid var(--t-border)',
            color: 'var(--t-text)',
            fontSize: 14,
            padding: '0 16px',
            fontFamily: 'var(--t-font-ui)',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />

        {/* Results list */}
        <div
          ref={listRef}
          style={{ maxHeight: 360, overflowY: 'auto' }}
        >
          {rows.length === 0 && (
            <div style={{
              padding: '16px 12px',
              fontSize: 12,
              color: 'var(--t-text-3)',
              textAlign: 'center',
            }}>
              No commands found
            </div>
          )}
          {rows.map((row) => {
            if (row.type === 'header') {
              return (
                <div
                  key={row.key}
                  style={{
                    fontSize: 9,
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                    color: 'var(--t-text-3)',
                    padding: '6px 12px 2px',
                  }}
                >
                  {row.group}
                </div>
              );
            }
            const isSelected = row.index === selectedIndex;
            return (
              <div
                key={row.key}
                data-selected={isSelected}
                onMouseEnter={() => setSelectedIndex(row.index)}
                onClick={() => row.cmd.action()}
                style={{
                  height: 36,
                  padding: '0 12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  background: isSelected ? 'var(--t-bg-3)' : 'transparent',
                  color: isSelected ? 'var(--t-text)' : 'var(--t-text-2)',
                  fontSize: 13,
                }}
              >
                <span>{row.cmd.label}</span>
                {row.cmd.hint && (
                  <span style={{
                    fontSize: 10,
                    fontFamily: 'monospace',
                    color: 'var(--t-text-3)',
                    background: 'var(--t-bg-1)',
                    padding: '1px 5px',
                    borderRadius: 2,
                    flexShrink: 0,
                    marginLeft: 8,
                  }}>
                    {row.cmd.hint}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{
          height: 28,
          background: 'var(--t-bg-1)',
          borderTop: '1px solid var(--t-border)',
          padding: '0 12px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}>
          <span style={{ fontSize: 10, color: 'var(--t-text-3)' }}>
            ↑↓ navigate&nbsp;&nbsp;↵ select&nbsp;&nbsp;Esc close
          </span>
        </div>
      </div>
    </div>
  );
}
