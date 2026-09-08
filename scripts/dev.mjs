import { spawn } from 'node:child_process';
import { existsSync, watch } from 'node:fs';
import { buildClient } from './build.mjs';

let building = false, again = false;
async function rebuild() {
  if (building) { again = true; return; }
  building = true;
  try { await buildClient({ dev: true }); } catch (e) { console.error(e.message); }
  building = false;
  if (again) { again = false; rebuild(); }
}
await rebuild();
watch('src', { recursive: true }, (_, f) => { if (f && !f.includes('__tests__')) rebuild(); });
spawn(process.execPath, ['scripts/static.mjs', 'dist', '5173'], { stdio: 'inherit' });
if (existsSync('src/server/index.ts')) {
  spawn('npx', ['tsx', 'watch', 'src/server/index.ts'], { stdio: 'inherit', env: { ...process.env, NODE_ENV: 'development', PORT: '8787' } });
}
console.log('client: http://localhost:5173/unicorns/');
