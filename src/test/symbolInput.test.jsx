/**
 * Regression test: Strategy Builder symbol input
 *
 * Bug: value={symbol} was bound directly to the Zustand store.
 * setSymbol('') fell back to 'SPY', so clearing the field snapped
 * it back immediately and the user could never type a new symbol.
 *
 * Fix: local state for keystrokes; commit to store only on blur / Enter.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRuleBuilderStore } from '../store/ruleBuilderStore.js';

// ── Minimal stubs so the workspace renders without real API calls ───────────
vi.mock('../api.js', () => ({
  api: {
    getRuleSets: vi.fn().mockResolvedValue([]),
    getStrategyTemplates: vi.fn().mockResolvedValue([]),
  },
}));

// Sub-components that are irrelevant to this test
vi.mock('../components/ConditionGroupBuilder.jsx', () => ({ default: () => null }));
vi.mock('../components/RuleActionEditor.jsx',      () => ({ default: () => null }));
vi.mock('../components/StrategyPreviewChart.jsx',  () => ({ default: () => null }));

import StrategyBuilderWorkspace from '../workspaces/StrategyBuilderWorkspace.jsx';

// Reset store between tests
beforeEach(() => {
  useRuleBuilderStore.setState({
    symbol: 'SPY',
    ruleSets: [],
    selectedRuleSet: null,
    draftRuleSet: { name: '', description: '', symbol: 'SPY', timeframe: '5m', conditions: [], actions: [], riskRules: '', conditionGroups: [] },
    evaluationResult: null,
    convertedStrategy: null,
    previewBacktest: null,
    loading: false,
    error: '',
    templates: [],
    selectedTemplate: null,
    templateLoading: false,
    templateError: '',
    lastUpdated: '',
    disclaimerAccepted: false,
    draftValidationErrors: {},
  });
});

describe('Symbol input — edit-then-commit flow', () => {
  it('retains intermediate keystrokes without snapping back to SPY', async () => {
    const user = userEvent.setup();
    render(<StrategyBuilderWorkspace />);

    const input = screen.getByPlaceholderText('SPY');
    expect(input.value).toBe('SPY');

    // Clear the field — previously snapped back to 'SPY' on every backspace
    await user.triple_click?.(input) ?? await user.click(input);
    await user.clear(input);

    // Mid-type: field must show the partial value, NOT 'SPY'
    await user.type(input, 'AAPL');
    expect(input.value).toBe('AAPL');
  });

  it('commits the new symbol to the store on blur', async () => {
    const user = userEvent.setup();
    render(<StrategyBuilderWorkspace />);

    const input = screen.getByPlaceholderText('SPY');
    await user.clear(input);
    await user.type(input, 'QQQ');

    // Store still holds 'SPY' during typing
    expect(useRuleBuilderStore.getState().symbol).toBe('SPY');

    // Blur commits
    fireEvent.blur(input);
    expect(useRuleBuilderStore.getState().symbol).toBe('QQQ');
  });

  it('commits the new symbol on Enter key', async () => {
    const user = userEvent.setup();
    render(<StrategyBuilderWorkspace />);

    const input = screen.getByPlaceholderText('SPY');
    await user.clear(input);
    await user.type(input, 'TSLA{Enter}');
    expect(useRuleBuilderStore.getState().symbol).toBe('TSLA');
  });

  it('auto-uppercases the committed value', async () => {
    const user = userEvent.setup();
    render(<StrategyBuilderWorkspace />);

    const input = screen.getByPlaceholderText('SPY');
    await user.clear(input);
    await user.type(input, 'msft');
    fireEvent.blur(input);
    expect(useRuleBuilderStore.getState().symbol).toBe('MSFT');
  });

  it('does NOT call loadRuleSets on every keystroke', async () => {
    const { api } = await import('../api.js');
    api.getRuleSets.mockClear();

    const user = userEvent.setup();
    render(<StrategyBuilderWorkspace />);

    // Initial mount triggers one load
    const callsAfterMount = api.getRuleSets.mock.calls.length;

    const input = screen.getByPlaceholderText('SPY');
    await user.clear(input);
    await user.type(input, 'NVDA'); // 4 keystrokes

    // No additional calls during typing — still at mount count
    expect(api.getRuleSets.mock.calls.length).toBe(callsAfterMount);
  });
});
