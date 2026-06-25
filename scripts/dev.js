import { spawn, execSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';

if (!existsSync('dist')) mkdirSync('dist');

console.log('=== Nav Dev Server ===\n');

// Build
console.log('[1/3] Building...');
execSync('npx vite build', { stdio: 'inherit' });
console.log('');

// Start servers
console.log('[2/3] Starting servers...');
console.log('  Frontend: http://localhost:5173');
console.log('  API:      http://localhost:8788\n');

const wrangler = spawn('npx', [
  'wrangler', 'pages', 'dev', 'dist',
  '--d1=DB', '--compatibility-date=2024-01-01', '--port', '8788',
], { stdio: 'pipe', shell: true });

wrangler.stdout.on('data', (d) => process.stdout.write(d));
wrangler.stderr.on('data', (d) => process.stderr.write(d));

const vite = spawn('npx', ['vite', '--port', '5173'], {
  stdio: 'inherit', shell: true,
});

// Init DB once wrangler is ready
wrangler.stdout.on('data', async function onReady(data) {
  const text = data.toString();
  if (text.includes('Ready on')) {
    wrangler.stdout.removeListener('data', onReady);

    console.log('\n[3/3] Initializing database...');
    try {
      const res = await fetch('http://127.0.0.1:8788/api/admin/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'change-this-to-a-secure-token' }),
      });
      const result = await res.json();
      if (result.success) {
        console.log('  Database ready.\n');
      } else {
        console.log('  DB init warning:', result.error || 'unknown', '\n');
      }
    } catch (e) {
      console.log('  DB init failed:', e.message, '(server may need restart)\n');
    }
  }
});

const kill = () => { wrangler.kill(); vite.kill(); process.exit(); };
process.on('SIGINT', kill);
process.on('SIGTERM', kill);
