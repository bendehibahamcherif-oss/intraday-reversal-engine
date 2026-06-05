import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const apiMock = vi.hoisted(() => ({
  getLiveDataDebug: vi.fn(() => ({})),
  api: {
    listProviderCredentials: vi.fn(),
    getFeedProviders: vi.fn(),
    getActiveFeedProviders: vi.fn(),
    setActiveFeedProviders: vi.fn(),
    saveFeedProviderCredentials: vi.fn(),
    deleteFeedProviderCredentials: vi.fn(),
    getFeedStatus: vi.fn(),
    getLatestTick: vi.fn(),
    getLatestCandle: vi.fn(),
    getLatestOrderBook: vi.fn(),
  },
}));

vi.mock('../api.js', () => apiMock);

const { useFeedStore } = await import('../store/feedStore.js');
const ProviderDiagnosticsPanel = (await import('../components/ProviderDiagnosticsPanel.jsx')).default;

const alphaConfiguredProvider = {
  id: 'alphaVantage', label: 'Alpha Vantage', requiresCredentials: true, credentialStatus: 'configured', runtimeStatus: 'delayed', selected: true, active: true, connected: false, realtime: false, delayed: true, warnings: [], priority: 4,
};

function resetStore() {
  useFeedStore.setState({
    feedStatus: null,
    providers: [],
    activeProviders: [],
    selectedProviders: [],
    providerSelectionDirty: false,
    lastValidActiveProviders: [],
    providerCredentialsStatus: {},
    providerCredentialsMeta: {},
    credentialsDraft: {},
    credentialsLoading: false,
    credentialsError: '',
    hasHydratedProviders: false,
    runtime: { source: 'unknown', activeProviders: [], providerOrder: [], connected: false, healthy: false, warnings: [] },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  resetStore();
  localStorage.setItem('providerSelection', JSON.stringify(['fallback_demo']));
});

describe('frontend provider source-of-truth flow', () => {
  it('initializes provider draft from backend activeProviders and ignores stale localStorage', async () => {
    apiMock.api.getActiveFeedProviders.mockResolvedValue({
      success: true,
      activeProviders: ['yahoo'],
      providerOrder: ['yahoo'],
      providers: [{ id: 'yahoo', credentialStatus: 'not_required', runtimeStatus: 'delayed', active: true, selected: true }],
    });

    await useFeedStore.getState().loadActiveProviders();

    expect(useFeedStore.getState().activeProviders).toEqual(['yahoo']);
    expect(useFeedStore.getState().selectedProviders).toEqual(['yahoo']);
    expect(useFeedStore.getState().selectedProviders).not.toContain('fallback_demo');
  });

  it('keeps checkbox changes in draft until save', () => {
    useFeedStore.setState({ activeProviders: ['yahoo', 'fallback_demo'], selectedProviders: ['yahoo', 'fallback_demo'] });
    useFeedStore.getState().toggleProvider('fallback_demo');
    expect(useFeedStore.getState().activeProviders).toEqual(['yahoo', 'fallback_demo']);
    expect(useFeedStore.getState().selectedProviders).toEqual(['yahoo']);
    expect(useFeedStore.getState().providerSelectionDirty).toBe(true);
  });

  it('unchecking fallback_demo and saving re-fetches backend truth and feed status', async () => {
    useFeedStore.setState({ activeProviders: ['yahoo', 'fallback_demo'], selectedProviders: ['yahoo'], providerSelectionDirty: true });
    apiMock.api.setActiveFeedProviders.mockResolvedValue({ success: true, activeProviders: ['yahoo'], providerOrder: ['yahoo'], providers: [] });
    apiMock.api.getActiveFeedProviders.mockResolvedValue({ success: true, activeProviders: ['yahoo'], providerOrder: ['yahoo'], providers: [{ id: 'yahoo', active: true, selected: true, credentialStatus: 'not_required', runtimeStatus: 'delayed' }] });
    apiMock.api.getFeedStatus.mockResolvedValue({ success: true, activeProviders: ['yahoo'], providerOrder: ['yahoo'], providers: [{ id: 'yahoo', active: true, selected: true, credentialStatus: 'not_required', runtimeStatus: 'delayed' }] });

    await useFeedStore.getState().saveActiveProviders();

    expect(apiMock.api.setActiveFeedProviders).toHaveBeenCalledWith(['yahoo'], ['SPY']);
    expect(apiMock.api.getFeedStatus).toHaveBeenCalled();
    expect(useFeedStore.getState().activeProviders).toEqual(['yahoo']);
    expect(useFeedStore.getState().selectedProviders).toEqual(['yahoo']);
    expect(useFeedStore.getState().providerSelectionDirty).toBe(false);
  });

  it('checking alphaVantage with credentials persists and diagnostics show no missing warning', async () => {
    useFeedStore.setState({ providers: [alphaConfiguredProvider], activeProviders: ['yahoo', 'alphaVantage'], selectedProviders: ['yahoo', 'alphaVantage'], providerCredentialsStatus: { alphaVantage: 'configured' } });
    render(<ProviderDiagnosticsPanel />);
    expect(screen.getByText('Alpha Vantage')).toBeTruthy();
    expect(screen.getAllByText('configured').length).toBeGreaterThan(0);
    expect(screen.queryByText(/Alpha Vantage API key not configured/i)).toBeNull();
    expect(screen.queryByText(/missing_credentials/i)).toBeNull();
  });

  it('save error displays and keeps dirty state visible', async () => {
    useFeedStore.setState({ selectedProviders: ['alphaVantage'], providerSelectionDirty: true });
    apiMock.api.setActiveFeedProviders.mockRejectedValue({ status: 400, responseBody: { error: 'Alpha Vantage requires API key' } });

    const result = await useFeedStore.getState().saveActiveProviders();

    expect(result).toBeNull();
    expect(useFeedStore.getState().credentialsError).toContain('Alpha Vantage requires API key');
    expect(useFeedStore.getState().providerSelectionDirty).toBe(true);
  });

  it('after credential save re-fetches credentials, provider health, and feed status', async () => {
    useFeedStore.setState({ credentialsDraft: { alphaVantage: { apiKey: 'abc12345' } } });
    apiMock.api.saveFeedProviderCredentials.mockResolvedValue({ success: true, provider: alphaConfiguredProvider, credentials: { configured: true, source: 'backend', masked: '****2345' } });
    apiMock.api.listProviderCredentials.mockResolvedValue({ success: true, credentials: { alphaVantage: { configured: true, source: 'backend', masked: '****2345' } } });
    apiMock.api.getActiveFeedProviders.mockResolvedValue({ success: true, activeProviders: ['yahoo', 'alphaVantage'], providerOrder: ['yahoo', 'alphaVantage'], providers: [alphaConfiguredProvider] });
    apiMock.api.getFeedStatus.mockResolvedValue({ success: true, activeProviders: ['yahoo', 'alphaVantage'], providerOrder: ['yahoo', 'alphaVantage'], providers: [alphaConfiguredProvider] });

    await useFeedStore.getState().saveCredentials('alphaVantage');

    expect(apiMock.api.listProviderCredentials).toHaveBeenCalled();
    expect(apiMock.api.getActiveFeedProviders).toHaveBeenCalled();
    expect(apiMock.api.getFeedStatus).toHaveBeenCalled();
    expect(useFeedStore.getState().providerCredentialsStatus.alphaVantage).toBe('configured');
  });
});

describe('frontend live data status labels', () => {
  it('yahoo delayed status displays DELAYED rather than NOT CONNECTED when REST data is delayed', async () => {
    const { statusLabel } = await import('../workspaces/LiveDataWorkspace.jsx');
    expect(statusLabel({ source: 'yahoo', connected: false, runtimeStatus: 'delayed' })).toBe('DELAYED (yahoo)');
    expect(statusLabel({ source: 'yahoo', connected: false, runtimeStatus: 'delayed' })).not.toContain('NOT CONNECTED');
  });
});
