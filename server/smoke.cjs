const { spawn } = require('child_process');

const child = spawn('node', ['server/index.cjs'], {
  env: { ...process.env, PORT: '4101', MONGO_URI: '' },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let ready = false;
child.stdout.on('data', (d) => {
  const text = d.toString();
  process.stdout.write(text);
  if (text.includes('Runtime backend listening')) {
    ready = true;
    fetch('http://127.0.0.1:4101/api/monitoring/runtime-status')
      .then((r) => r.json())
      .then((j) => {
        if (!j.success) throw new Error('runtime-status unsuccessful');
        return fetch('http://127.0.0.1:4101/api/replay-legacy/candles/SPY');
      })
      .then((r) => r.json())
      .then((j) => {
        if (!j.success) throw new Error('replay route unsuccessful');
        console.log('Smoke checks passed');
        child.kill('SIGTERM');
        process.exit(0);
      })
      .catch((err) => {
        console.error('Smoke failed:', err.message);
        child.kill('SIGTERM');
        process.exit(1);
      });
  }
});

child.stderr.on('data', (d) => process.stderr.write(d.toString()));

setTimeout(() => {
  if (!ready) {
    console.error('Smoke failed: startup timeout');
    child.kill('SIGTERM');
    process.exit(1);
  }
}, 12000);
