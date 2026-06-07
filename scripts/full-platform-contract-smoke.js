#!/usr/bin/env node
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
const commands = [
  ['frontend', ['node', 'scripts/full-frontend-smoke.js']],
  ['backend', ['node', 'scripts/full-backend-smoke.js']],
];
const results = commands.map(([name, cmd]) => {
  const out = spawnSync(cmd[0], cmd.slice(1), { cwd: process.cwd(), encoding: 'utf8', stdio: 'pipe' });
  process.stdout.write(out.stdout || ''); process.stderr.write(out.stderr || '');
  return { name, ok: out.status === 0, status: out.status, signal: out.signal };
});
const summary = { ok: results.every((r) => r.ok), generatedAt: new Date().toISOString(), results };
fs.writeFileSync(path.join(process.cwd(), 'FULL_PLATFORM_CONTRACT_SMOKE_RESULTS.json'), `${JSON.stringify(summary, null, 2)}\n`);
process.exit(summary.ok ? 0 : 1);
