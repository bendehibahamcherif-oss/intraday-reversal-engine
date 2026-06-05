#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const out = process.argv[2] || 'datasets/features_snapshot.csv';
const rows = Number(process.argv[3] || 240);
fs.mkdirSync(path.dirname(out), { recursive: true });
const lines = ['timestamp,symbol,open,high,low,close,volume'];
let price = 100;
const start = Date.parse('2026-01-02T14:30:00.000Z');
for (let i = 0; i < rows; i += 1) {
  const drift = Math.sin(i / 9) * 0.18 + Math.cos(i / 17) * 0.08;
  const open = price;
  const close = Math.max(1, open + drift + (i % 11 === 0 ? 0.12 : -0.02));
  const high = Math.max(open, close) + 0.08 + (i % 5) * 0.01;
  const low = Math.min(open, close) - 0.08 - (i % 7) * 0.01;
  const volume = 1000000 + Math.round(Math.sin(i / 13) * 120000) + (i % 20) * 1000;
  const ts = new Date(start + i * 60_000).toISOString();
  lines.push([ts, 'SPY', open.toFixed(4), high.toFixed(4), low.toFixed(4), close.toFixed(4), volume].join(','));
  price = close;
}
fs.writeFileSync(out, `${lines.join('\n')}\n`);
console.log(JSON.stringify({ ok: true, path: out, rows }));
