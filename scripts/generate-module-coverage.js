#!/usr/bin/env node
/**
 * scripts/generate-module-coverage.js
 *
 * Reads the workspace registry and the functional spec to produce MODULE_COVERAGE.json.
 * Marks each workspace as 'covered' if its [WorkspaceId] tag appears in the spec file,
 * or 'not_covered' otherwise.
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

// Dynamic ESM import of the workspace registry
const { workspaceDefinitions } = await import('../src/config/workspaces.js');

const SPEC_FILE = join(root, 'tests', 'e2e', 'functional', 'workspace-functional.spec.ts');
const specSource = existsSync(SPEC_FILE) ? readFileSync(SPEC_FILE, 'utf8') : '';

if (!specSource) {
  console.error('[generate-coverage] ⚠  Spec file not found:', SPEC_FILE);
}

// Coverage detection strategy:
//  1. If the spec uses workspaceDefinitions in a for-loop over allWorkspaces, ALL
//     implemented workspaces are dynamically covered.
//  2. Otherwise, look for literal [WorkspaceId] patterns in the spec source.
const usesAutoDiscovery = specSource.includes('workspaceDefinitions') &&
  (specSource.includes('for (const workspace of') || specSource.includes('for(const workspace of'));

function isCoveredInSpec(workspaceId) {
  if (usesAutoDiscovery) return true;
  return specSource.includes(`[${workspaceId}]`);
}

const modules = workspaceDefinitions
  .filter((w) => w.implemented)
  .sort((a, b) => a.order - b.order)
  .map((w) => {
    const inSpec = isCoveredInSpec(w.id);
    return {
      id:            w.id,
      label:         w.label,
      group:         w.group,
      desktopVisible: Boolean(w.desktopVisible),
      mobileVisible:  Boolean(w.mobileVisible),
      mobilePrimary:  Boolean(w.mobilePrimary),
      status:        inSpec ? 'covered' : 'not_covered',
      specFile:      inSpec ? 'tests/e2e/functional/workspace-functional.spec.ts' : null,
    };
  });

const covered    = modules.filter((m) => m.status === 'covered').length;
const deferred   = modules.filter((m) => m.status.startsWith('deferred:')).length;
const notCovered = modules.filter((m) => m.status === 'not_covered').length;
const total      = modules.length;

const summary = { covered, deferred, not_covered: notCovered, total };
const output  = { generatedAt: new Date().toISOString(), summary, modules };

writeFileSync(join(root, 'MODULE_COVERAGE.json'), JSON.stringify(output, null, 2));
console.log(`[generate-coverage] ${covered}/${total} modules covered`);

if (notCovered > 0) {
  const missing = modules.filter((m) => m.status === 'not_covered').map((m) => `  - ${m.id} (${m.label})`).join('\n');
  console.error(`[generate-coverage] ❌ ${notCovered} module(s) have no coverage:\n${missing}`);
  process.exit(1);
}

console.log('[generate-coverage] ✅ All implemented modules are covered');
