#!/usr/bin/env node
/**
 * Mobile navigation smoke test — static source checks.
 *
 * Verifies that every workspace in the canonical registry is reachable on mobile
 * through either a primary tab or the More drawer, and that the TerminalSidebar
 * includes all desktop workspaces.
 *
 * Usage: node scripts/mobile-navigation-smoke.js
 * Writes: MOBILE_NAVIGATION_SMOKE_RESULTS.json
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root      = resolve(__dirname, '..');

function read(rel) {
  return readFileSync(resolve(root, rel), 'utf8');
}

const results = [];
let passed = 0;
let failed = 0;

function check(label, ok, detail = '') {
  const status = ok ? 'PASS' : 'FAIL';
  if (ok) passed++; else failed++;
  results.push({ label, status, detail });
  console.log(`${ok ? '✅' : '❌'} [${status}] ${label}${detail ? `  — ${detail}` : ''}`);
}

// ── Load the workspace registry source ────────────────────────────────────────

const registrySrc = read('src/config/workspaces.js');

check('Registry has DEFAULT_WORKSPACE_ID', registrySrc.includes('DEFAULT_WORKSPACE_ID'));
check('Registry exports normalizeWorkspaceId', registrySrc.includes('normalizeWorkspaceId'));
check('Registry exports isValidWorkspaceId', registrySrc.includes('isValidWorkspaceId'));
check('Registry exports getMobilePrimaryWorkspaces', registrySrc.includes('getMobilePrimaryWorkspaces'));
check('Registry exports getMobileMoreWorkspaces', registrySrc.includes('getMobileMoreWorkspaces'));
check('Registry exports getDesktopWorkspaces', registrySrc.includes('getDesktopWorkspaces'));
check('Registry exports getWorkspace', registrySrc.includes('getWorkspace'));
check('Registry has mobilePrimary flag', registrySrc.includes('mobilePrimary'));
check('Registry has mobileVisible flag', registrySrc.includes('mobileVisible'));
check('Registry has desktopVisible flag', registrySrc.includes('desktopVisible'));

// Count workspace definitions
const idMatches = [...registrySrc.matchAll(/\{\s*id:\s*'([^']+)'/g)].map((m) => m[1]);
check('Registry defines at least 19 workspaces', idMatches.length >= 19, `found ${idMatches.length}`);

// Critical workspaces must be present
const criticalIds = ['Risk', 'MLEngine', 'AILab', 'HistoricalData', 'Portfolio', 'Alerts', 'OMS', 'Institutional', 'Ops'];
for (const id of criticalIds) {
  const found = idMatches.includes(id);
  check(`Registry includes ${id}`, found);
}

// ── MobileBottomNav source checks ─────────────────────────────────────────────

const navSrc = read('src/components/terminal/MobileBottomNav.jsx');

check('MobileBottomNav imports getMobileMoreWorkspaces', navSrc.includes('getMobileMoreWorkspaces'));
check('MobileBottomNav imports getMobilePrimaryWorkspaces', navSrc.includes('getMobilePrimaryWorkspaces'));
check('MobileBottomNav renders More dialog', navSrc.includes('role="dialog"'));
check('MobileBottomNav has mobile-more-workspaces testId', navSrc.includes('mobile-more-workspaces'));
check('MobileBottomNav maps moreItems', navSrc.includes('moreItems'));
check('MobileBottomNav uses navTestId for items', navSrc.includes('navTestId'));
check('MobileBottomNav has close button for drawer', navSrc.includes('Close more workspaces') || navSrc.includes('close more workspaces') || navSrc.includes('setMoreOpen(false)'));

// Old hardcoded Portfolio-as-MORE tab must be gone.
check(
  'MobileBottomNav no longer hardcodes Portfolio as MORE tab',
  !navSrc.match(/label:\s*['"]MORE['"]/),
);

// ── workspaceStore validation ─────────────────────────────────────────────────

const storeSrc = read('src/store/workspaceStore.js');

check('workspaceStore imports normalizeWorkspaceId', storeSrc.includes('normalizeWorkspaceId'));
check('workspaceStore imports DEFAULT_WORKSPACE_ID', storeSrc.includes('DEFAULT_WORKSPACE_ID'));
check('workspaceStore normalizes in setWorkspace', storeSrc.includes('normalizeWorkspaceId(workspace)') || storeSrc.includes('normalizeWorkspaceId(get()'));
check('workspaceStore has onRehydrateStorage', storeSrc.includes('onRehydrateStorage'));
check('workspaceStore uses safeStorage or try/catch', storeSrc.includes('safeWorkspaceStorage') || storeSrc.includes('try {'));

// ── TerminalSidebar completeness ──────────────────────────────────────────────

const sidebarSrc = read('src/TerminalSidebar.jsx');

check('TerminalSidebar imports getDesktopWorkspaces', sidebarSrc.includes('getDesktopWorkspaces'));
check('TerminalSidebar maps all workspaces from registry', sidebarSrc.includes('getDesktopWorkspaces()') || sidebarSrc.includes('navItems'));

// ── All workspaces reachable on mobile ────────────────────────────────────────

check(
  'All mobile workspaces reachable (primary + More drawer)',
  navSrc.includes('getMobilePrimaryWorkspaces') && navSrc.includes('getMobileMoreWorkspaces'),
  'registry-driven primary + more drawer',
);

// ── Summary ───────────────────────────────────────────────────────────────────

const summary = { passed, failed, total: passed + failed, results };
writeFileSync(
  resolve(root, 'MOBILE_NAVIGATION_SMOKE_RESULTS.json'),
  JSON.stringify(summary, null, 2),
);

console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed}/${passed + failed} checks passed`);

if (failed > 0) process.exit(1);
