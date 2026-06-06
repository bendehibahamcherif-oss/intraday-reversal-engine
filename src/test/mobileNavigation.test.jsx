import { describe, it, expect, beforeEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import MobileBottomNav from '../components/terminal/MobileBottomNav.jsx';
import { getWorkspaceComponent } from '../config/workspaceComponents.jsx';
import {
  DEFAULT_WORKSPACE_ID,
  getDesktopWorkspaces,
  getImplementedWorkspaces,
  getMobileMoreWorkspaces,
  getMobilePrimaryWorkspaces,
  getWorkspace,
  normalizeWorkspaceId,
  workspaceDefinitions,
} from '../config/workspaces.js';
import { useWorkspaceStore } from '../store/workspaceStore.js';

function WorkspaceHost() {
  const workspace = useWorkspaceStore((s) => s.workspace);
  const workspaceConfig = getWorkspace(workspace);
  const Component = getWorkspaceComponent(workspaceConfig);
  return <Component marketData={{}} />;
}

function openMoreMenu() {
  render(<MobileBottomNav />);
  fireEvent.click(screen.getByRole('button', { name: /more/i }));
}

beforeEach(() => {
  localStorage.clear();
  useWorkspaceStore.setState({ workspace: DEFAULT_WORKSPACE_ID });
});

describe('canonical workspace registry', () => {
  it('all desktop workspaces exist in canonical workspace registry', () => {
    const registryIds = new Set(workspaceDefinitions.map((workspace) => workspace.id));
    for (const workspace of getDesktopWorkspaces()) {
      expect(registryIds.has(workspace.id)).toBe(true);
    }
  });

  it('all implemented workspaces are accessible on mobile via primary nav or More menu', () => {
    const mobileIds = new Set([
      ...getMobilePrimaryWorkspaces().map((workspace) => workspace.id),
      ...getMobileMoreWorkspaces().map((workspace) => workspace.id),
    ]);

    for (const workspace of getImplementedWorkspaces()) {
      expect(mobileIds.has(workspace.id), `${workspace.label} should be mobile accessible`).toBe(true);
    }
  });

  it('no implemented workspace has a missing component', () => {
    for (const workspace of getImplementedWorkspaces()) {
      expect(getWorkspaceComponent(workspace), `${workspace.label} component should resolve`).toBeTypeOf('function');
    }
  });
});

describe('mobile More menu', () => {
  it('opens the mobile More menu', () => {
    openMoreMenu();
    expect(screen.getByRole('dialog', { name: /more workspaces/i })).toBeTruthy();
  });

  it('contains Historical Data', () => {
    openMoreMenu();
    expect(screen.getByRole('button', { name: /historical data/i })).toBeTruthy();
  });

  it('contains Backtesting', () => {
    openMoreMenu();
    expect(screen.getByRole('button', { name: /backtesting/i })).toBeTruthy();
  });

  it('contains Portfolio', () => {
    openMoreMenu();
    expect(screen.getByRole('button', { name: /portfolio/i })).toBeTruthy();
  });

  it('contains Risk', () => {
    openMoreMenu();
    expect(screen.getByRole('button', { name: /^risk$/i })).toBeTruthy();
  });

  it('contains Macro / Correlation entries', () => {
    openMoreMenu();
    expect(screen.getByRole('button', { name: /macro \/ multi-asset/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /correlation/i })).toBeTruthy();
  });
});

describe('mobile workspace selection', () => {
  it('selecting Historical Data on mobile renders Historical Data workspace', async () => {
    render(<><WorkspaceHost /><MobileBottomNav /></>);
    fireEvent.click(screen.getByRole('button', { name: /more/i }));
    fireEvent.click(screen.getByRole('button', { name: /historical data/i }));
    expect(await screen.findByText(/Historical Datasets/i)).toBeTruthy();
  });

  it('selecting AI Lab on mobile renders AI Lab', async () => {
    render(<><WorkspaceHost /><MobileBottomNav /></>);
    fireEvent.click(screen.getByRole('button', { name: /ai/i }));
    expect(await screen.findByText(/AI Lab/i)).toBeTruthy();
  });

  it('selecting Backtesting on mobile renders Backtesting', async () => {
    render(<><WorkspaceHost /><MobileBottomNav /></>);
    fireEvent.click(screen.getByRole('button', { name: /more/i }));
    fireEvent.click(screen.getByRole('button', { name: /backtesting/i }));
    expect(await screen.findByText(/Preview Backtest/i)).toBeTruthy();
  });

  it('selecting Portfolio on mobile renders Portfolio', async () => {
    render(<><WorkspaceHost /><MobileBottomNav /></>);
    fireEvent.click(screen.getByRole('button', { name: /more/i }));
    fireEvent.click(screen.getByRole('button', { name: /portfolio/i }));
    expect(await screen.findByText(/Portfolio Analytics/i)).toBeTruthy();
  });

  it('selecting Risk on mobile renders Risk', async () => {
    render(<><WorkspaceHost /><MobileBottomNav /></>);
    fireEvent.click(screen.getByRole('button', { name: /more/i }));
    fireEvent.click(screen.getByRole('button', { name: /^risk$/i }));
    expect(await screen.findByText(/Risk Analytics/i)).toBeTruthy();
  });

  it('closes More menu after selecting a workspace', () => {
    render(<MobileBottomNav />);
    fireEvent.click(screen.getByRole('button', { name: /more/i }));
    fireEvent.click(screen.getByRole('button', { name: /historical data/i }));
    expect(screen.queryByRole('dialog', { name: /more workspaces/i })).toBeNull();
  });
});

describe('workspace state validation and persistence', () => {
  it('active workspace persists after refresh through the persisted store payload', () => {
    act(() => useWorkspaceStore.getState().setWorkspace('HistoricalData'));
    const payload = JSON.parse(localStorage.getItem('reversal-workspace'));
    expect(payload.state.workspace).toBe('HistoricalData');
  });

  it('invalid persisted workspace resets safely', () => {
    act(() => useWorkspaceStore.setState({ workspace: 'DoesNotExist' }));
    act(() => useWorkspaceStore.getState().validateWorkspace());
    expect(useWorkspaceStore.getState().workspace).toBe(DEFAULT_WORKSPACE_ID);
    expect(normalizeWorkspaceId('DoesNotExist')).toBe(DEFAULT_WORKSPACE_ID);
  });
});
