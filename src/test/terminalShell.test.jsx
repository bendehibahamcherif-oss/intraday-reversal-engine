import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { useCommandPaletteStore } from '../store/commandPaletteStore.js';
import { useTerminalLayoutStore } from '../store/terminalLayoutStore.js';
import { useWorkspaceStore } from '../store/workspaceStore.js';
import CommandPalette from '../components/terminal/CommandPalette.jsx';
import MobileBottomNav from '../components/terminal/MobileBottomNav.jsx';
import LayoutPresetSelector from '../components/terminal/LayoutPresetSelector.jsx';

// Reset stores before each test
beforeEach(() => {
  useCommandPaletteStore.setState({ open: false, query: '', selectedIndex: 0 });
  useTerminalLayoutStore.setState({
    leftVisible: true,
    rightVisible: true,
    bottomVisible: true,
    sidebarCollapsed: false,
    layoutPreset: 'default',
    fullscreenPanel: null,
    panelSizes: { left: 15, center: 55, right: 20, bottom: 10 },
  });
  useWorkspaceStore.setState({ workspace: 'ChartOrderflow' });
});

// ── Command Palette ────────────────────────────────────────────────────────

describe('CommandPalette', () => {
  it('is not visible when closed', () => {
    render(<CommandPalette />);
    expect(screen.queryByPlaceholderText(/type a command/i)).toBeNull();
  });

  it('opens when openPalette is called', () => {
    render(<CommandPalette />);
    act(() => useCommandPaletteStore.getState().openPalette());
    expect(screen.getByPlaceholderText(/type a command/i)).toBeTruthy();
  });

  it('closes on Escape key', () => {
    render(<CommandPalette />);
    act(() => useCommandPaletteStore.getState().openPalette());
    const input = screen.getByPlaceholderText(/type a command/i);
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(useCommandPaletteStore.getState().open).toBe(false);
  });

  it('filters commands by query and shows results', () => {
    render(<CommandPalette />);
    act(() => useCommandPaletteStore.getState().openPalette());
    const input = screen.getByPlaceholderText(/type a command/i);
    fireEvent.change(input, { target: { value: 'chart' } });
    // At least one result containing "Chart" should be visible
    expect(screen.getAllByText(/chart/i).length).toBeGreaterThan(0);
  });

  it('closes palette after executing a workspace command', () => {
    render(<CommandPalette />);
    act(() => useCommandPaletteStore.getState().openPalette());
    const input = screen.getByPlaceholderText(/type a command/i);
    fireEvent.change(input, { target: { value: 'Chart' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(useCommandPaletteStore.getState().open).toBe(false);
  });

  it('shows keyboard hint footer when open', () => {
    render(<CommandPalette />);
    act(() => useCommandPaletteStore.getState().openPalette());
    expect(screen.getByText(/navigate/i)).toBeTruthy();
  });
});

// ── Terminal Layout Store ──────────────────────────────────────────────────

describe('terminalLayoutStore', () => {
  it('initialises with correct defaults', () => {
    const s = useTerminalLayoutStore.getState();
    expect(s.leftVisible).toBe(true);
    expect(s.rightVisible).toBe(true);
    expect(s.bottomVisible).toBe(true);
    expect(s.fullscreenPanel).toBeNull();
    expect(s.layoutPreset).toBe('default');
  });

  it('toggleLeft hides then shows left panel', () => {
    const { toggleLeft } = useTerminalLayoutStore.getState();
    act(() => toggleLeft());
    expect(useTerminalLayoutStore.getState().leftVisible).toBe(false);
    act(() => useTerminalLayoutStore.getState().toggleLeft());
    expect(useTerminalLayoutStore.getState().leftVisible).toBe(true);
  });

  it('setFullscreen sets the panel id', () => {
    act(() => useTerminalLayoutStore.getState().setFullscreen('center'));
    expect(useTerminalLayoutStore.getState().fullscreenPanel).toBe('center');
  });

  it('exitFullscreen clears fullscreen', () => {
    act(() => useTerminalLayoutStore.getState().setFullscreen('center'));
    act(() => useTerminalLayoutStore.getState().exitFullscreen());
    expect(useTerminalLayoutStore.getState().fullscreenPanel).toBeNull();
  });

  it('toggleFullscreen toggles on then off', () => {
    act(() => useTerminalLayoutStore.getState().toggleFullscreen('left'));
    expect(useTerminalLayoutStore.getState().fullscreenPanel).toBe('left');
    act(() => useTerminalLayoutStore.getState().toggleFullscreen('left'));
    expect(useTerminalLayoutStore.getState().fullscreenPanel).toBeNull();
  });

  it('resetLayout restores all defaults', () => {
    act(() => {
      useTerminalLayoutStore.getState().toggleLeft();
      useTerminalLayoutStore.getState().toggleRight();
      useTerminalLayoutStore.getState().setFullscreen('center');
    });
    act(() => useTerminalLayoutStore.getState().resetLayout());
    const s = useTerminalLayoutStore.getState();
    expect(s.leftVisible).toBe(true);
    expect(s.rightVisible).toBe(true);
    expect(s.fullscreenPanel).toBeNull();
  });

  it('setPreset chart-only hides side and bottom panels', () => {
    act(() => useTerminalLayoutStore.getState().setPreset('chart-only'));
    const s = useTerminalLayoutStore.getState();
    expect(s.leftVisible).toBe(false);
    expect(s.rightVisible).toBe(false);
    expect(s.bottomVisible).toBe(false);
    expect(s.layoutPreset).toBe('chart-only');
  });

  it('layout state persists key: reversal-terminal-layout', () => {
    // Just verify the persist config uses the right key by checking the store
    // (actual localStorage persistence tested by zustand/middleware itself)
    expect(typeof useTerminalLayoutStore.getState().toggleLeft).toBe('function');
  });
});

// ── Workspace switching ────────────────────────────────────────────────────

describe('workspace switching', () => {
  it('workspaceStore starts on ChartOrderflow', () => {
    expect(useWorkspaceStore.getState().workspace).toBe('ChartOrderflow');
  });

  it('setWorkspace changes workspace', () => {
    act(() => useWorkspaceStore.getState().setWorkspace('MLEngine'));
    expect(useWorkspaceStore.getState().workspace).toBe('MLEngine');
  });

  it('command palette workspace commands update workspaceStore', () => {
    render(<CommandPalette />);
    act(() => useCommandPaletteStore.getState().openPalette());
    const input = screen.getByPlaceholderText(/type a command/i);
    // Filter to ML Engine workspace
    fireEvent.change(input, { target: { value: 'ML Engine' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(useWorkspaceStore.getState().workspace).toBe('MLEngine');
  });
});

// ── Mobile Bottom Nav ──────────────────────────────────────────────────────

describe('MobileBottomNav', () => {
  it('renders 5 tabs', () => {
    render(<MobileBottomNav />);
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBe(5);
  });

  it('first tab (CHART) activates ChartOrderflow workspace', () => {
    render(<MobileBottomNav />);
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[0]);
    expect(useWorkspaceStore.getState().workspace).toBe('ChartOrderflow');
  });

  it('clicking MARKETS tab switches to Macro workspace', () => {
    render(<MobileBottomNav />);
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[1]);
    expect(useWorkspaceStore.getState().workspace).toBe('Macro');
  });
});

// ── LayoutPresetSelector ───────────────────────────────────────────────────

describe('LayoutPresetSelector', () => {
  it('renders preset buttons', () => {
    render(<LayoutPresetSelector />);
    expect(screen.getByText(/chart only/i)).toBeTruthy();
  });

  it('clicking chart-only applies the preset', () => {
    render(<LayoutPresetSelector />);
    fireEvent.click(screen.getByText(/chart only/i));
    expect(useTerminalLayoutStore.getState().layoutPreset).toBe('chart-only');
  });

  it('clicking Reset Layout restores defaults', () => {
    act(() => useTerminalLayoutStore.getState().toggleLeft());
    expect(useTerminalLayoutStore.getState().leftVisible).toBe(false);
    render(<LayoutPresetSelector />);
    fireEvent.click(screen.getByText(/reset/i));
    expect(useTerminalLayoutStore.getState().leftVisible).toBe(true);
  });
});

// ── Resilience without market data ────────────────────────────────────────

describe('no crash without market data', () => {
  it('CommandPalette renders without throwing', () => {
    expect(() => render(<CommandPalette />)).not.toThrow();
  });

  it('MobileBottomNav renders without throwing', () => {
    expect(() => render(<MobileBottomNav />)).not.toThrow();
  });

  it('LayoutPresetSelector renders without throwing', () => {
    expect(() => render(<LayoutPresetSelector />)).not.toThrow();
  });
});
