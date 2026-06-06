import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { ProviderStateService } = require('../../server/providerStateService.cjs');

let tmpDir;
let service;
let oldAlpha;

beforeEach(() => {
  oldAlpha = process.env.ALPHA_VANTAGE_API_KEY;
  delete process.env.ALPHA_VANTAGE_API_KEY;
  delete process.env.ALPHAVANTAGE_API_KEY;
  delete process.env.VITE_ALPHA_VANTAGE_API_KEY;
  delete process.env.IBKR_GATEWAY_CONNECTED;
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'provider-state-'));
  service = new ProviderStateService({ filePath: path.join(tmpDir, 'state.json') });
});

afterEach(() => {
  if (oldAlpha === undefined) delete process.env.ALPHA_VANTAGE_API_KEY;
  else process.env.ALPHA_VANTAGE_API_KEY = oldAlpha;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('ProviderStateService credentials and active provider selection', () => {
  it('saves Alpha Vantage credentials and never returns the full key', () => {
    const key = 'AV-SECRET-1234';
    const result = service.saveCredential('alphaVantage', key);
    expect(result.provider.credentialStatus).toBe('configured');
    expect(result.provider.runtimeStatus).not.toBe('missing_credentials');
    const credentials = service.credentialsResponse();
    expect(credentials.alphaVantage).toEqual({ configured: true, source: 'backend', masked: '**********1234' });
    expect(JSON.stringify(credentials)).not.toContain(key);
  });

  it('reports Alpha Vantage configured in health after save with no missing credential warning', () => {
    service.saveCredential('alphaVantage', 'abc12345');
    const alpha = service.healthResponse().providers.find((p) => p.id === 'alphaVantage');
    expect(alpha.credentialStatus).toBe('configured');
    expect(alpha.runtimeStatus).not.toBe('missing_credentials');
    expect(alpha.warnings.join(' ')).not.toMatch(/not configured|api key/i);
  });

  it('delete credentials changes credentialStatus to missing', () => {
    service.saveCredential('alphaVantage', 'abc12345');
    service.deleteCredential('alphaVantage');
    const alpha = service.healthResponse().providers.find((p) => p.id === 'alphaVantage');
    expect(alpha.credentialStatus).toBe('missing');
    expect(alpha.runtimeStatus).toBe('missing_credentials');
  });

  it('persists yahoo only and does not re-add fallback_demo', () => {
    const result = service.saveActiveProviders({ providers: ['yahoo'], providerOrder: ['yahoo'] });
    expect(result.activeProviders).toEqual(['yahoo']);
    expect(result.providerOrder).toEqual(['yahoo']);
    expect(result.activeProviders).not.toContain('fallback_demo');
    const reloaded = new ProviderStateService({ filePath: path.join(tmpDir, 'state.json') });
    expect(reloaded.healthResponse().activeProviders).toEqual(['yahoo']);
  });

  it('persists yahoo + alphaVantage in order when credentials are configured', () => {
    service.saveCredential('alphaVantage', 'abc12345');
    const result = service.saveActiveProviders({ providers: ['yahoo', 'alphaVantage'], providerOrder: ['yahoo', 'alphaVantage'] });
    expect(result.activeProviders).toEqual(['yahoo', 'alphaVantage']);
    expect(result.providerOrder).toEqual(['yahoo', 'alphaVantage']);
    expect(result.activeProviders).not.toContain('fallback_demo');
  });

  it('rejects selecting alphaVantage without credentials', () => {
    expect(() => service.saveActiveProviders({ providers: ['alphaVantage'], providerOrder: ['alphaVantage'] }))
      .toThrow(/requires API key/);
  });

  it('feed status activeProviders equals health activeProviders', () => {
    service.saveActiveProviders({ providers: ['yahoo'], providerOrder: ['yahoo'] });
    expect(service.feedStatusResponse().activeProviders).toEqual(service.healthResponse().activeProviders);
  });

  it('yahoo delayed source reports runtimeStatus delayed and is not marked as websocket connected', () => {
    service.saveActiveProviders({ providers: ['yahoo'], providerOrder: ['yahoo'] });
    const yahoo = service.healthResponse().providers.find((p) => p.id === 'yahoo');
    expect(yahoo).toMatchObject({
      selected: true,
      active: true,
      connected: false,
      runtimeStatus: 'delayed',
      credentialStatus: 'not_required',
      sourceType: 'delayed',
      warning: 'Yahoo is delayed data, not institutional real-time feed.',
    });
  });

  it('rejects empty provider selection with structured validation code', () => {
    expect(() => service.saveActiveProviders({ providers: [], providerOrder: [] }))
      .toThrow(/Select at least one provider/);
    try {
      service.saveActiveProviders({ providers: [], providerOrder: [] });
    } catch (error) {
      expect(error.code).toBe('NO_PROVIDER_SELECTED');
      expect(error.status).toBe(400);
    }
  });

  it('env var credential counts as configured', () => {
    process.env.ALPHA_VANTAGE_API_KEY = 'ENV-ALPHA-9999';
    const withEnv = new ProviderStateService({ filePath: path.join(tmpDir, 'env-state.json') });
    const alpha = withEnv.healthResponse().providers.find((p) => p.id === 'alphaVantage');
    expect(alpha.credentialStatus).toBe('configured');
    expect(withEnv.credentialsResponse().alphaVantage.source).toBe('env');
  });

  it('rejects unknown providers', () => {
    expect(() => service.saveActiveProviders({ providers: ['not_real'] })).toThrow(/Unknown provider/);
  });
});
