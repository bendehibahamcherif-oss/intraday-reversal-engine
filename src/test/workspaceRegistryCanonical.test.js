/**
 * Canonical workspace registry integrity tests.
 *
 * These tests enforce the ONE CAPABILITY = ONE ENTRY rule:
 *   - No duplicate workspace IDs
 *   - No functional-duplicate workspace IDs from the removed list
 *   - No duplicate visible labels (except via aliases)
 *   - Every componentKey resolves to a registered component
 *   - Desktop and mobile use the same component for each ID
 *   - At least 4 mobile-primary workspaces
 *   - MacroMultiAsset is the canonical macro entry
 *   - Providers is a canonical entry (separate from LiveData)
 *   - No removed-duplicate IDs present
 */
import { describe, it, expect } from 'vitest';
import { workspaceDefinitions, workspaceById, sortedWorkspaces, DEFAULT_WORKSPACE_ID } from '../config/workspaces.js';
import { workspaceComponents } from '../config/workspaceComponents.jsx';

// ── IDs that must NOT appear in the canonical registry ──────────────────────
const REMOVED_DUPLICATE_IDS = [
  'VolumeProfile',
  'Macro',             // was labeled 'Markets' — replaced by MacroMultiAsset
  'Correlation',       // tab inside MacroMultiAsset
  'Beta',              // tab inside MacroMultiAsset
  'Credentials',       // tab inside Providers
  'StreamStatus',      // tab inside LiveData
  'ProviderDiagnostics',
  'MLChampionInference',
  'MLModelCard',
  'MLTrainingRuns',
  'MLPredictions',
  'MLDiagnosticsDrift',
  'StrategyBuilder',   // duplicate of Backtesting
  'Settings',          // duplicate of Ops (Ops is already mobileVisible)
];

// ── IDs that MUST appear in the canonical registry ──────────────────────────
const REQUIRED_CANONICAL_IDS = [
  'ChartOrderflow',
  'MacroMultiAsset',
  'Alerts',
  'AILab',
  'Risk',
  'LiveData',
  'Providers',
  'HistoricalData',
  'MLEngine',
  'Execution',
  'Backtesting',
  'PaperTrading',
  'Portfolio',
  'StrategyLab',
  'QuantLab',
  'Replay',
  'OMS',
  'Institutional',
  'Ops',
];

const registeredComponentKeys = new Set(Object.keys(workspaceComponents));

describe('canonical workspace registry', () => {
  it('removed duplicate IDs must not reappear', () => {
    for (const id of REMOVED_DUPLICATE_IDS) {
      expect(workspaceById[id], `${id} was removed as a duplicate but is still registered`).toBeUndefined();
    }
  });

  it('all required canonical IDs are present', () => {
    for (const id of REQUIRED_CANONICAL_IDS) {
      expect(workspaceById[id], `canonical workspace ${id} is missing from registry`).toBeDefined();
    }
  });

  it('no duplicate workspace IDs', () => {
    const seen = new Map();
    for (const w of workspaceDefinitions) {
      expect(seen.has(w.id), `duplicate workspace id: ${w.id}`).toBe(false);
      seen.set(w.id, true);
    }
  });

  it('no duplicate visible labels (unless covered by aliases)', () => {
    const labelCounts = new Map();
    for (const w of workspaceDefinitions.filter((x) => x.desktopVisible || x.mobileVisible)) {
      const key = w.label.trim().toLowerCase();
      if (!labelCounts.has(key)) labelCounts.set(key, []);
      labelCounts.get(key).push(w.id);
    }
    for (const [label, ids] of labelCounts) {
      if (ids.length > 1) {
        const workspaces = ids.map((id) => workspaceById[id]);
        const allCoveredByAliases = workspaces.every((w) => Array.isArray(w.aliases) && w.aliases.map((a) => a.toLowerCase()).includes(label));
        expect(allCoveredByAliases, `duplicate visible label "${label}" in: ${ids.join(', ')}`).toBe(true);
      }
    }
  });

  it('every componentKey resolves to a registered component', () => {
    for (const w of workspaceDefinitions) {
      expect(registeredComponentKeys.has(w.componentKey), `workspace ${w.id} has unresolved componentKey: ${w.componentKey}`).toBe(true);
    }
  });

  it('desktop and mobile use the same componentKey per ID', () => {
    for (const w of workspaceDefinitions) {
      if (w.desktopVisible && w.mobileVisible) {
        // All entries use the same definition — single-registry guarantee
        const same = workspaceDefinitions.filter((x) => x.id === w.id);
        expect(same.length).toBe(1);
      }
    }
  });

  it('at least 4 mobile-primary workspaces', () => {
    const primaries = workspaceDefinitions.filter((w) => w.mobilePrimary);
    expect(primaries.length).toBeGreaterThanOrEqual(4);
  });

  it('MacroMultiAsset has mobilePrimary:true (canonical Macro module)', () => {
    expect(workspaceById['MacroMultiAsset']?.mobilePrimary).toBe(true);
  });

  it('Providers and LiveData are both present as separate canonical entries', () => {
    expect(workspaceById['LiveData']).toBeDefined();
    expect(workspaceById['Providers']).toBeDefined();
    expect(workspaceById['LiveData'].componentKey).toBe('LiveData');
    expect(workspaceById['Providers'].componentKey).toBe('LiveData');
  });

  it('default workspace exists', () => {
    expect(workspaceById[DEFAULT_WORKSPACE_ID]).toBeDefined();
  });

  it('registry is between 18 and 25 canonical entries (neither bloated nor gutted)', () => {
    expect(sortedWorkspaces.length).toBeGreaterThanOrEqual(18);
    expect(sortedWorkspaces.length).toBeLessThanOrEqual(25);
  });

  it('every workspace has all required fields', () => {
    for (const w of workspaceDefinitions) {
      expect(w.id,           `${w.id} missing id`).toBeTruthy();
      expect(w.label,        `${w.id} missing label`).toBeTruthy();
      expect(w.icon,         `${w.id} missing icon`).toBeTruthy();
      expect(w.group,        `${w.id} missing group`).toBeTruthy();
      expect(w.order,        `${w.id} missing order`).toBeGreaterThan(0);
      expect(w.componentKey, `${w.id} missing componentKey`).toBeTruthy();
      expect(w.navTestId,    `${w.id} missing navTestId`).toBeTruthy();
      expect(w.ariaLabel,    `${w.id} missing ariaLabel`).toBeTruthy();
    }
  });
});
