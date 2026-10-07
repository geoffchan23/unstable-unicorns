import { spawn } from 'node:child_process';
import { existsSync, watch } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { buildClient } from './build.mjs';

// Dev builds live under dist/dev/unicorns so they never race the production
// build (dist/unicorns) when both webServers run at once (e.g. under Playwright).
const DEV_OUTDIR = 'dist/dev/unicorns';

// Overridable so this can coexist with another dev server on the default port
// (5173 is Vite's default, so a Vite app running elsewhere will claim it and
// win on localhost, which resolves to ::1 before 127.0.0.1 on macOS).
const CLIENT_PORT = process.env.UNICORNS_CLIENT_PORT ?? '5173';
const SERVER_PORT = process.env.UNICORNS_SERVER_PORT ?? '8787';

let building = false, again = false;
async function rebuild() {
  if (building) { again = true; return; }
  building = true;
  try { await buildClient({ dev: true, outdir: DEV_OUTDIR, serverUrl: `ws://{host}:${SERVER_PORT}` }); } catch (e) { console.error(e.message); }
  building = false;
  if (again) { again = false; rebuild(); }
}
await rebuild();
watch('src', { recursive: true }, (_, f) => { if (f && !f.includes('__tests__')) rebuild(); });

const children = [];
children.push(spawn(process.execPath, ['scripts/static.mjs', 'dist/dev', CLIENT_PORT], { stdio: 'inherit' }));
if (existsSync('src/server/index.ts')) {
  children.push(spawn('npx', ['tsx', 'watch', 'src/server/index.ts'], { stdio: 'inherit', env: { ...process.env, NODE_ENV: 'development', PORT: SERVER_PORT, HOST_GRACE_MS: '3000' } }));
}
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { children.forEach((c) => c.kill()); process.exit(0); });
console.log(`client: http://localhost:${CLIENT_PORT}/unicorns/`);
// the address other devices on the network can open (the page finds the game server on the same host)
for (const a of Object.values(networkInterfaces()).flat()) {
  if (a && a.family === 'IPv4' && !a.internal) console.log(`   lan: http://${a.address}:${CLIENT_PORT}/unicorns/`);
}
