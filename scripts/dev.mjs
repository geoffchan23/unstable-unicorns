import { spawn } from 'node:child_process';
import { existsSync, watch } from 'node:fs';
import { buildClient } from './build.mjs';

// Dev builds live under dist/dev/unicorns so they never race the production
// build (dist/unicorns) when both webServers run at once (e.g. under Playwright).
const DEV_OUTDIR = 'dist/dev/unicorns';

let building = false, again = false;
async function rebuild() {
  if (building) { again = true; return; }
  building = true;
  try { await buildClient({ dev: true, outdir: DEV_OUTDIR }); } catch (e) { console.error(e.message); }
  building = false;
  if (again) { again = false; rebuild(); }
}
await rebuild();
watch('src', { recursive: true }, (_, f) => { if (f && !f.includes('__tests__')) rebuild(); });

const children = [];
children.push(spawn(process.execPath, ['scripts/static.mjs', 'dist/dev', '5173'], { stdio: 'inherit' }));
if (existsSync('src/server/index.ts')) {
  children.push(spawn('npx', ['tsx', 'watch', 'src/server/index.ts'], { stdio: 'inherit', env: { ...process.env, NODE_ENV: 'development', PORT: '8787', HOST_GRACE_MS: '3000' } }));
}
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { children.forEach((c) => c.kill()); process.exit(0); });
console.log('client: http://localhost:5173/unicorns/');
