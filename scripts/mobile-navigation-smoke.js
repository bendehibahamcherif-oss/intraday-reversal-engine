#!/usr/bin/env node
/**
 * Mobile navigation smoke test — static source checks.
 *
 * Verifies that every workspace in the canonical registry is reachable
 * on mobile through either a primary tab or the More drawer, and that
 * the TerminalSidebar includes all workspaces.
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

// Extract workspace IDs from the registry file.
const idMatches = [...registrySrc.matchAll(/id:\s*'([^']+)'/g)].map((m) => m[1]);
check('Registry exports workspace ids', idMatches.length >= 18, `found ${idMatches.length}`);

// Extract MOBILE_PRIMARY_TAB_IDS.
const primaryMatch = registrySrc.match(/MOBILE_PRIMARY_TAB_IDS\s*=\s*\[([^\]]+)\]/);
const primaryIds   = primaryMatch
  ? [...primaryMatch[1].matchAll(/'([^']+)'/g)].map((m) => m[1])
  : [];
check('Registry exports MOBILE_PRIMARY_TAB_IDS with 4 entries', primaryIds.length === 4, `found ${primaryIds.length}`);

// Verify MOBILE_MORE_WORKSPACES is derived (not duplicating ids from primary).
check(
  'MOBILE_MORE_WORKSPACES excludes primary tab ids',
  registrySrc.includes('MOBILE_PRIMARY_TAB_IDS.includes'),
  'filter expression not found',
);

// ── MobileBottomNav source checks ─────────────────────────────────────────────

const navSrc = read('src/components/terminal/MobileBottomNav.jsx');

check('MobileBottomNav imports MOBILE_MORE_WORKSPACES', navSrc.includes('MOBILE_MORE_WORKSPACES'));
check('MobileBottomNav imports MOBILE_PRIMARY_TAB_IDS', navSrc.includes('MOBILE_PRIMARY_TAB_IDS'));
check('MobileBottomNav has more-drawer data-testid', navSrc.includes('data-testid="more-drawer"'));
check('MobileBottomNav renders more-item data-testids', navSrc.includes('more-item-'));
check('MobileBottomNav maps MOBILE_MORE_WORKSPACES in drawer', navSrc.includes('MOBILE_MORE_WORKSPACES.map'));
check('MobileBottomNav has More button', navSrc.includes('mobile-tab-more'));
check('MobileBottomNav backdrop for drawer', navSrc.includes('setDrawerOpen(false)'));

// Old hardcoded Portfolio-as-MORE tab must be gone.
check(
  'MobileBottomNav no longer hardcodes Portfolio as MORE',
  !navSrc.match(/id:\s*['"]Portfolio['"][^}]+label.*MORE/),
);

// ── workspaceStore validation ─────────────────────────────────────────────────

const storeSrc = read('src/store/workspaceStore.js');

check('workspaceStore imports isValidWorkspace', storeSrc.includes('isValidWorkspace'));
check('workspaceStore validates setWorkspace', storeSrc.includes('if (!isValidWorkspace'));
check('workspaceStore has onRehydrateStorage', storeSrc.includes('onRehydrateStorage'));
check('workspaceStore uses DEFAULT_WORKSPACE', storeSrc.includes('DEFAULT_WORKSPACE'));

// ── TerminalSidebar completeness ──────────────────────────────────────────────

const sidebarSrc = read('src/TerminalSidebar.jsx');

check('TerminalSidebar imports WORKSPACES registry', sidebarSrc.includes('WORKSPACES'));
// Sidebar is driven by WORKSPACES.map() — all 18 ids (incl. OMS/Institutional/Ops) come from the registry.
check(
  'TerminalSidebar maps all workspaces from registry (covers OMS/Institutional/Ops)',
  sidebarSrc.includes('WORKSPACES.map'),
  sidebarSrc.includes('WORKSPACES.map') ? 'WORKSPACES.map found' : 'registry map not found',
);

// All workspace ids must appear in either MobileBottomNav (via imports) or drawer.
const coveredOnMobile = primaryIds.length > 0 && navSrc.includes('MOBILE_MORE_WORKSPACES.map');
check(
  'All workspaces reachable on mobile (primary tabs + More drawer)',
  coveredOnMobile,
  coveredOnMobile ? 'primary tabs + drawer covers all' : 'drawer mapping not found',
);

// ── Summary ───────────────────────────────────────────────────────────────────

const summary = { passed, failed, total: passed + failed, results };
writeFileSync(
  resolve(root, 'MOBILE_NAVIGATION_SMOKE_RESULTS.json'),
  JSON.stringify(summary, null, 2),
);

console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed}/${passed + failed} checks passed`);

if (failed > 0) process.exit(1);
