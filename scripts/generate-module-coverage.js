#!/usr/bin/env node
/**
 * scripts/generate-module-coverage.js
 *
 * Reads the workspace registry and BOTH spec files to produce MODULE_COVERAGE.json.
 *
 * Coverage tiers (priority order):
 *   covered        — real value assertion against real backend + expectNoBrokenState
 *                    detected via @coverage:covered <id> in real-backend spec
 *   deferred:<why> — backend not ready; reason documented
 *                    detected via @coverage:deferred:<reason> <id> in real-backend spec
 *   mount_only     — only mount/visibility tested (auto-discovery loop in functional spec)
 *   not_covered    — appears in neither spec
 *
 * Usage:
 *   node scripts/generate-module-coverage.js
 *
 * Exits non-zero if any desktopVisible or mobileVisible module is not_covered.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root      = join(__dirname, '..');

const { workspaceDefinitions } = await import('../src/config/workspaces.js');

// ── Phase 1 spec (mount_only tier via auto-discovery loop) ───────────────────
const FUNCTIONAL_SPEC  = join(root, 'tests', 'e2e', 'functional', 'workspace-functional.spec.ts');
const functionalSource = existsSync(FUNCTIONAL_SPEC) ? readFileSync(FUNCTIONAL_SPEC, 'utf8') : '';
if (!functionalSource) {
  console.warn('[generate-coverage] ⚠  Functional spec not found:', FUNCTIONAL_SPEC);
}

const hasMountDiscovery = functionalSource.includes('workspaceDefinitions') &&
  (functionalSource.includes('for (const workspace of') || functionalSource.includes('for(const workspace of'));

// ── Phase 2 real-backend specs (covered / deferred tiers via annotations) ────
const REAL_BACKEND_SPEC = join(root, 'tests', 'e2e', 'real-backend', 'functional-all-modules.spec.ts');
const MACRO_REAL_SPEC   = join(root, 'tests', 'e2e', 'macro-real-data.spec.ts');

const realBackendSource = existsSync(REAL_BACKEND_SPEC) ? readFileSync(REAL_BACKEND_SPEC, 'utf8') : '';
const macroRealSource   = existsSync(MACRO_REAL_SPEC)   ? readFileSync(MACRO_REAL_SPEC, 'utf8')   : '';

if (!realBackendSource) {
  console.warn('[generate-coverage] ⚠  Real-backend spec not found:', REAL_BACKEND_SPEC);
}

// Combine all real-backend sources for annotation scanning
const combinedRealSource = realBackendSource + '\n' + macroRealSource;

// Parse @coverage:covered <id> and @coverage:deferred:<reason> <id>
const coveredSet  = new Set();
const deferredMap = new Map(); // workspaceId → 'deferred:<reason>'

for (const line of combinedRealSource.split('\n')) {
  const coveredMatch  = line.match(/@coverage:covered\s+(\w+)/);
  const deferredMatch = line.match(/@coverage:(deferred:[^\s]+)\s+(\w+)/);
  if (coveredMatch)  coveredSet.add(coveredMatch[1]);
  if (deferredMatch) deferredMap.set(deferredMatch[2], deferredMatch[1]);
}

function getStatus(workspaceId) {
  if (coveredSet.has(workspaceId))  return 'covered';
  if (deferredMap.has(workspaceId)) return deferredMap.get(workspaceId);
  if (hasMountDiscovery)            return 'mount_only';
  return 'not_covered';
}

function getSpecFile(status) {
  if (status === 'covered' || status.startsWith('deferred:')) {
    return 'tests/e2e/real-backend/functional-all-modules.spec.ts';
  }
  if (status === 'mount_only') return 'tests/e2e/functional/workspace-functional.spec.ts';
  return null;
}

const modules = workspaceDefinitions
  .filter((w) => w.implemented)
  .sort((a, b) => a.order - b.order)
  .map((w) => {
    const status = getStatus(w.id);
    return {
      id:             w.id,
      label:          w.label,
      group:          w.group,
      desktopVisible: Boolean(w.desktopVisible),
      mobileVisible:  Boolean(w.mobileVisible),
      mobilePrimary:  Boolean(w.mobilePrimary),
      status,
      specFile:       getSpecFile(status),
    };
  });

const covered    = modules.filter((m) => m.status === 'covered').length;
const deferred   = modules.filter((m) => m.status.startsWith('deferred:')).length;
const mountOnly  = modules.filter((m) => m.status === 'mount_only').length;
const notCovered = modules.filter((m) => m.status === 'not_covered').length;
const total      = modules.length;

const summary = { covered, deferred, mount_only: mountOnly, not_covered: notCovered, total };
const output  = { generatedAt: new Date().toISOString(), summary, modules };

writeFileSync(join(root, 'MODULE_COVERAGE.json'), JSON.stringify(output, null, 2));
console.log(
  `[generate-coverage] ${covered} covered / ${deferred} deferred / ${mountOnly} mount_only / ${notCovered} not_covered  (${total} total)`,
);

if (notCovered > 0) {
  const missing = modules
    .filter((m) => m.status === 'not_covered')
    .map((m) => `  - ${m.id} (${m.label})`)
    .join('\n');
  console.error(`[generate-coverage] ❌ ${notCovered} module(s) have no coverage at all:\n${missing}`);
  process.exit(1);
}

console.log('[generate-coverage] ✅ All implemented modules have at least mount_only coverage');
