#!/usr/bin/env node
/**
 * scripts/check-module-coverage.js  —  MODULE_COVERAGE.json barrier
 *
 * Reads MODULE_COVERAGE.json (written by generate-module-coverage.js) and fails
 * CI based on the 3-tier coverage system:
 *
 * Acceptable statuses:
 *   'covered'         — real value assertion vs real backend + expectNoBrokenState
 *   'deferred:<why>'  — explicitly deferred with documented reason (stub/no_route/etc.)
 *   'mount_only'      — only mount/visibility tested (Phase 1 spec)
 *
 * NOT acceptable (→ CI failure):
 *   'not_covered'     — module is visible but appears in no spec at all
 *
 * NOTE: mount_only is currently accepted so Phase 1 CI passes.
 *       When Phase 2 real-backend spec is complete, tighten to reject mount_only.
 *
 * Usage:
 *   node scripts/check-module-coverage.js
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root      = join(__dirname, '..');

const coveragePath = join(root, 'MODULE_COVERAGE.json');

if (!existsSync(coveragePath)) {
  console.error('[check-coverage] ❌  MODULE_COVERAGE.json not found.');
  console.error('  Run:  node scripts/generate-module-coverage.js');
  process.exit(1);
}

let coverage;
try {
  coverage = JSON.parse(readFileSync(coveragePath, 'utf8'));
} catch (e) {
  console.error('[check-coverage] ❌  Failed to parse MODULE_COVERAGE.json:', e.message);
  process.exit(1);
}

const VALID_DEFERRED_PREFIXES = ['stub', 'no_route', 'live_feed', 'ml_model', 'ml_training'];

function isValidStatus(status) {
  if (status === 'covered')    return true;
  if (status === 'mount_only') return true;  // Phase 1 tier: accepted
  if (!status.startsWith('deferred:')) return false;
  const reason = status.slice('deferred:'.length);
  return VALID_DEFERRED_PREFIXES.some((p) => reason.startsWith(p));
}

const modules        = Array.isArray(coverage.modules) ? coverage.modules : [];
const visibleModules = modules.filter((m) => m.desktopVisible || m.mobileVisible);

const failures = visibleModules.filter((m) => !isValidStatus(m.status));

if (failures.length > 0) {
  console.error('[check-coverage] ❌  MODULE COVERAGE BARRIER FAILED');
  console.error(`  ${failures.length} visible module(s) have invalid coverage status:\n`);
  failures.forEach((m) => {
    console.error(
      `  • ${m.id} (${m.label})  status="${m.status}"  ` +
      `desktop=${m.desktopVisible}  mobile=${m.mobileVisible}`,
    );
  });
  console.error('\n  Valid statuses: covered | mount_only | deferred:<stub|no_route|live_feed|ml_model|ml_training>');
  console.error('  Add @coverage:covered or @coverage:deferred:<reason> annotations to real-backend spec.');
  process.exit(1);
}

const { covered = 0, deferred = 0, mount_only: mountOnly = 0, not_covered: notCovered = 0, total = 0 } =
  coverage.summary || {};

console.log('[check-coverage] ✅  MODULE COVERAGE BARRIER PASSED');
console.log(`  covered=${covered}  deferred=${deferred}  mount_only=${mountOnly}  not_covered=${notCovered}  total=${total}`);

if (deferred > 0) {
  console.log('  Deferred modules (backend not yet ready):');
  modules
    .filter((m) => String(m.status).startsWith('deferred:'))
    .forEach((m) => console.log(`    ⚠  ${m.id}: ${m.status}`));
}
if (mountOnly > 0) {
  console.log(`  ${mountOnly} module(s) are mount_only — promote to covered in real-backend spec when backend routes are implemented.`);
}
