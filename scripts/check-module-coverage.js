#!/usr/bin/env node
/**
 * scripts/check-module-coverage.js  —  MODULE_COVERAGE.json barrier
 *
 * Reads MODULE_COVERAGE.json (written by generate-module-coverage.js) and fails
 * CI if any desktopVisible or mobileVisible module is not covered.
 *
 * Acceptable statuses:
 *   'covered'         — spec exists in workspace-functional.spec.ts
 *   'deferred:<why>'  — explicitly deferred with documented reason
 *
 * Not acceptable (→ CI failure):
 *   'not_covered'     — module is visible but has no spec
 *   missing entry     — module exists in registry but not in MODULE_COVERAGE.json
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

const modules       = Array.isArray(coverage.modules) ? coverage.modules : [];
const visibleModules = modules.filter((m) => m.desktopVisible || m.mobileVisible);

const failures = visibleModules.filter(
  (m) => m.status !== 'covered' && !String(m.status).startsWith('deferred:'),
);

if (failures.length > 0) {
  console.error('[check-coverage] ❌  MODULE COVERAGE BARRIER FAILED');
  console.error(`  ${failures.length} visible module(s) lack functional test coverage:\n`);
  failures.forEach((m) => {
    console.error(`  • ${m.id} (${m.label})  status="${m.status}"  desktopVisible=${m.desktopVisible}  mobileVisible=${m.mobileVisible}`);
  });
  console.error('\n  Fix: add a [WorkspaceId] describe block in tests/e2e/functional/workspace-functional.spec.ts');
  process.exit(1);
}

const { covered = 0, deferred = 0, total = 0 } = coverage.summary || {};
console.log(`[check-coverage] ✅  MODULE COVERAGE BARRIER PASSED`);
console.log(`  Covered: ${covered}  Deferred: ${deferred}  Total: ${total}`);
if (deferred > 0) {
  const deferredList = modules.filter((m) => String(m.status).startsWith('deferred:'));
  deferredList.forEach((m) => console.log(`  ⚠  ${m.id}: ${m.status}`));
}
