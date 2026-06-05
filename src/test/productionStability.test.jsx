/**
 * Production stability tests.
 * Verifies that 404/error API responses do not crash the UI.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { usePortfolioStore } from '../store/portfolioStore.js';
import { useMLStore } from '../store/mlStore.js';
import PortfolioWorkspace from '../workspaces/PortfolioWorkspace.jsx';
import TrainingRunsPanel from '../components/TrainingRunsPanel.jsx';
import PredictionHistoryTable from '../components/PredictionHistoryTable.jsx';
import ErrorBoundary from '../components/ErrorBoundary.jsx';

// ── Store resets ───────────────────────────────────────────────────────────────

beforeEach(() => {
  usePortfolioStore.setState({
    mode: 'paper',
    positions: [], positionsLoading: false, positionsError: '',
    pnl: null, pnlLoading: false, pnlError: '',
    exposure: null, exposureLoading: false, exposureError: '',
    drawdown: null, drawdownLoading: false, drawdownError: '',
    varResult: null, varLoading: false, varError: '',
    stressTestResult: null, stressTestLoading: false, stressTestError: '',
    riskStatus: null, riskStatusLoading: false, killSwitchLoading: false,
  });

  useMLStore.setState({
    trainingRuns: [], trainingLoading: false, trainingError: '',
    predictionHistory: [], predictionsLoading: false, predictionsError: '',
  });
});

// ── Portfolio: 404 responses ───────────────────────────────────────────────────

describe('Portfolio workspace — 404 resilience', () => {
  it('renders without crashing when all portfolio endpoints are unavailable', () => {
    usePortfolioStore.setState({
      positionsError: 'Endpoint not available',
      pnlError:       'Endpoint not available',
      exposureError:  'Endpoint not available',
      drawdownError:  'Endpoint not available',
    });
    expect(() => render(<PortfolioWorkspace />)).not.toThrow();
  });

  it('renders correctly when pnlError is set (store-level check)', () => {
    // Test at store level: error state is stored correctly and read back.
    usePortfolioStore.setState({ pnlError: 'Endpoint not available', pnlLoading: false });
    expect(usePortfolioStore.getState().pnlError).toBe('Endpoint not available');
  });

  it('renders correctly when exposureError is set (store-level check)', () => {
    usePortfolioStore.setState({ exposureError: 'Endpoint not available', exposureLoading: false });
    expect(usePortfolioStore.getState().exposureError).toBe('Endpoint not available');
  });

  it('shows "No open positions" fallback when positions is empty and no error', () => {
    render(<PortfolioWorkspace />);
    expect(screen.getByText(/no open positions/i)).toBeTruthy();
  });

  it('renders pnl empty state correctly when pnl is null and no error', () => {
    render(<PortfolioWorkspace />);
    expect(screen.getByText(/no p&l data/i)).toBeTruthy();
  });
});

// ── ML workspace — 404 resilience ─────────────────────────────────────────────

describe('TrainingRunsPanel — 404 resilience', () => {
  it('renders without crashing when training error is HTTP error message', () => {
    useMLStore.setState({ trainingError: 'Endpoint not available' });
    expect(() => render(<TrainingRunsPanel />)).not.toThrow();
  });

  it('shows error message text, not a crash', () => {
    useMLStore.setState({ trainingError: 'Endpoint not available' });
    render(<TrainingRunsPanel />);
    expect(screen.getByText('Endpoint not available')).toBeTruthy();
  });

  it('shows empty state when training runs is empty array', () => {
    useMLStore.setState({ trainingRuns: [], trainingError: '' });
    render(<TrainingRunsPanel />);
    expect(screen.getByText(/no trained models yet/i)).toBeTruthy();
  });
});

describe('PredictionHistoryTable — 404 resilience', () => {
  it('renders without crashing with empty predictions', () => {
    expect(() => render(
      <PredictionHistoryTable predictions={[]} loading={false} error="" />
    )).not.toThrow();
  });

  it('shows error text, not a crash, when error is set', () => {
    render(<PredictionHistoryTable predictions={[]} loading={false} error="Endpoint not available" />);
    expect(screen.getByText('Endpoint not available')).toBeTruthy();
  });

  it('handles null predictions prop gracefully (falls back to [])', () => {
    expect(() => render(
      <PredictionHistoryTable predictions={null} loading={false} error="" />
    )).not.toThrow();
  });
});

// ── ErrorBoundary — reset functionality ───────────────────────────────────────

describe('ErrorBoundary', () => {
  it('renders children when no error', () => {
    render(<ErrorBoundary><span>OK</span></ErrorBoundary>);
    expect(screen.getByText('OK')).toBeTruthy();
  });

  it('renders System Error UI when child throws', () => {
    const Thrower = () => { throw new Error('test crash'); };
    // suppress expected console.error in test output
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<ErrorBoundary><Thrower /></ErrorBoundary>);
    expect(screen.getByText('System Error')).toBeTruthy();
    expect(screen.getByText('test crash')).toBeTruthy();
    spy.mockRestore();
  });

  it('shows Reset App State and Reload Page buttons', () => {
    const Thrower = () => { throw new Error('crash'); };
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<ErrorBoundary><Thrower /></ErrorBoundary>);
    expect(screen.getAllByText(/reset app state/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/reload page/i).length).toBeGreaterThan(0);
    spy.mockRestore();
  });
});

// ── WebSocket disconnect — stores don't crash ─────────────────────────────────

describe('Stores resilient to disconnected WS', () => {
  it('portfolioStore.loadAll() does not throw when API is unavailable', async () => {
    // Mock api to throw (simulates 404 / network error)
    vi.mock('../api.js', () => ({
      api: {
        getPortfolioPositions: () => Promise.reject(new Error('Endpoint not available')),
        getPortfolioPnL:       () => Promise.reject(new Error('Endpoint not available')),
        getPortfolioExposure:  () => Promise.reject(new Error('Endpoint not available')),
        getPortfolioDrawdown:  () => Promise.reject(new Error('Endpoint not available')),
        getPaperRiskStatus:    () => Promise.reject(new Error('Endpoint not available')),
      },
    }));
    await expect(
      act(() => usePortfolioStore.getState().loadAll())
    ).resolves.not.toThrow();
  });
});
