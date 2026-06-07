#!/usr/bin/env node
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const commands = [
  { name: 'static-api-scanner', command: 'node', args: ['scripts/static-api-scanner.js'] },
  { name: 'detect-menu-duplicates', command: 'node', args: ['scripts/detect-menu-duplicates.js'] },
  { name: 'frontend-smoke', command: 'npm', args: ['run', 'frontend:smoke'] },
  { name: 'playwright-desktop-journey', command: 'npx', args: ['playwright', 'test', 'tests/e2e/production-user-journey.spec.ts'] },
  { name: 'playwright-mobile-journey', command: 'npx', args: ['playwright', 'test', 'tests/e2e/mobile-user-journey.spec.ts'] },
  { name: 'app-crawler', command: 'npx', args: ['playwright', 'test', 'tests/e2e/app-crawler.spec.ts'] },
  { name: 'storage-fuzz', command: 'npx', args: ['playwright', 'test', 'tests/e2e/storage-fuzz.spec.ts'] },
  { name: 'payload-fuzz', command: 'npx', args: ['playwright', 'test', 'tests/e2e/payload-fuzz.spec.ts'] },
  { name: 'screen-sanity', command: 'npx', args: ['playwright', 'test', 'tests/e2e/screen-sanity.spec.ts'] },
];

const results = [];
for (const item of commands) {
  const startedAt = new Date().toISOString();
  const res = spawnSync(item.command, item.args, { stdio: 'pipe', encoding: 'utf8', shell: false, env: process.env });
  const result = {
    name: item.name,
    command: [item.command, ...item.args].join(' '),
    startedAt,
    finishedAt: new Date().toISOString(),
    status: res.status ?? 1,
    ok: res.status === 0,
    stdout: (res.stdout || '').slice(-8000),
    stderr: (res.stderr || res.error?.message || '').slice(-8000),
  };
  results.push(result);
  fs.writeFileSync('PRODUCTION_READINESS_RESULTS.json', JSON.stringify({ generatedAt: new Date().toISOString(), ok: results.every((r) => r.ok), results }, null, 2));
  process.stdout.write(`\n[${result.ok ? 'PASS' : 'FAIL'}] ${result.command}\n`);
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (!result.ok) process.exit(result.status || 1);
}
console.log('Production readiness passed.');
