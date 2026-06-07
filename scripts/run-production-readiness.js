#!/usr/bin/env node
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const productionContract = process.env.PRODUCTION_CONTRACT === '1';
const apiBase = process.env.API_BASE || process.env.VITE_API_BASE || 'https://reversal.onrender.com';

const playwrightArgs = (spec) => ['run', 'e2e', '--', spec];

const baseCommands = [
  { name: 'static-api-scanner', command: 'node', args: ['scripts/static-api-scanner.js'] },
  { name: 'detect-menu-duplicates', command: 'node', args: ['scripts/detect-menu-duplicates.js'] },
  { name: 'frontend-smoke', command: 'npm', args: ['run', 'frontend:smoke'] },
  { name: 'playwright-desktop-journey', command: 'npm', args: playwrightArgs('tests/e2e/production-user-journey.spec.ts') },
  { name: 'playwright-mobile-journey', command: 'npm', args: playwrightArgs('tests/e2e/mobile-user-journey.spec.ts') },
  { name: 'app-crawler', command: 'npm', args: playwrightArgs('tests/e2e/app-crawler.spec.ts') },
  { name: 'storage-fuzz', command: 'npm', args: playwrightArgs('tests/e2e/storage-fuzz.spec.ts') },
  { name: 'payload-fuzz', command: 'npm', args: playwrightArgs('tests/e2e/payload-fuzz.spec.ts') },
  { name: 'screen-sanity', command: 'npm', args: playwrightArgs('tests/e2e/screen-sanity.spec.ts') },
];

// Production contract mode: test real backend API contracts after all mock-based checks pass.
// PLAYWRIGHT_BASE_URL skips the Vite dev server for the direct-HTTP contract test.
const productionContractCommands = [
  {
    name: 'production-backend-contract',
    command: 'npm',
    args: playwrightArgs('tests/e2e/production-backend-contract.spec.ts'),
    env: { PLAYWRIGHT_BASE_URL: apiBase, VITE_API_BASE: apiBase },
  },
  {
    name: 'production-real-backend-journey',
    command: 'npm',
    args: playwrightArgs('tests/e2e/production-real-backend-journey.spec.ts'),
    env: { VITE_API_BASE: apiBase },
  },
];

const commands = productionContract
  ? [...baseCommands, ...productionContractCommands]
  : baseCommands;

const results = [];
for (const item of commands) {
  const startedAt = new Date().toISOString();
  const env = { ...process.env, ...(item.env || {}) };
  const res = spawnSync(item.command, item.args, { stdio: 'pipe', encoding: 'utf8', shell: false, env });
  const result = {
    name: item.name,
    command: [item.command, ...item.args].join(' '),
    env: item.env || {},
    startedAt,
    finishedAt: new Date().toISOString(),
    status: res.status ?? 1,
    ok: res.status === 0,
    stdout: (res.stdout || '').slice(-8000),
    stderr: (res.stderr || res.error?.message || '').slice(-8000),
  };
  results.push(result);
  fs.writeFileSync('PRODUCTION_READINESS_RESULTS.json', JSON.stringify({ generatedAt: new Date().toISOString(), mode: productionContract ? 'production-contract' : 'mock', ok: results.every((r) => r.ok), results }, null, 2));
  process.stdout.write(`\n[${result.ok ? 'PASS' : 'FAIL'}] ${result.command}\n`);
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (!result.ok) process.exit(result.status || 1);
}
console.log(`Production readiness passed (mode: ${productionContract ? 'production-contract' : 'mock'}).`);
