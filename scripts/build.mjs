import { build } from 'esbuild';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

export async function buildClient({ dev = false, serverUrl, outdir = 'dist/unicorns' } = {}) {
  // a dev rebuild only replaces the app bundle: wiping the folder while it is being served (and while a
  // second rebuild copies art into it) left half the art missing
  if (dev && existsSync(outdir)) { for (const f of readdirSync(outdir)) if (f.startsWith('app.')) rmSync(join(outdir, f), { force: true }); }
  else rmSync(outdir, { recursive: true, force: true });
  mkdirSync(outdir, { recursive: true });
  const artDir = 'assets/art';
  const artIds = existsSync(artDir) ? readdirSync(artDir).filter((f) => f.endsWith('.webp')).map((f) => f.slice(0, -5)) : [];
  if (artIds.length) {
    mkdirSync(join(outdir, 'art'), { recursive: true });
    for (const id of artIds) { const dest = join(outdir, 'art', `${id}.webp`); if (!dev || !existsSync(dest)) cpSync(join(artDir, `${id}.webp`), dest); }
  }
  const result = await build({
    entryPoints: { app: 'src/ui/main.tsx' },
    bundle: true, minify: !dev, sourcemap: dev, format: 'iife', target: 'es2020',
    outdir, entryNames: '[name].[hash]', metafile: true, jsx: 'automatic',
    define: {
      'process.env.NODE_ENV': dev ? '"development"' : '"production"',
      __ART_IDS__: JSON.stringify(artIds),
      __SERVER_URL__: JSON.stringify(serverUrl ?? (dev ? 'ws://localhost:8787' : 'wss://play.geoffreychan.com')),
      __DEV__: String(dev),
    },
  });
  const outs = Object.keys(result.metafile.outputs).map((p) => p.replace(`${outdir}/`, ''));
  const js = outs.find((f) => f.endsWith('.js')); const css = outs.find((f) => f.endsWith('.css'));
  let html = readFileSync('src/ui/index.html', 'utf8').replace('__JS__', js).replace('__CSS__', css);
  writeFileSync(join(outdir, 'index.html'), html);
  // PWA assets (Task 10 fills src/ui/pwa; copy whatever exists)
  if (existsSync('src/ui/pwa/icons')) cpSync('src/ui/pwa/icons', join(outdir, 'icons'), { recursive: true });
  if (existsSync('src/ui/pwa/manifest.webmanifest')) cpSync('src/ui/pwa/manifest.webmanifest', join(outdir, 'manifest.webmanifest'));
  if (existsSync('src/ui/pwa/sw.js')) {
    const files = walk(outdir).filter((f) => f !== 'sw.js' && f !== 'index.html');
    const precache = ['./', ...files];
    const hash = createHash('sha1').update(precache.join('\n') + readFileSync('src/ui/pwa/sw.js', 'utf8')).digest('hex').slice(0, 10);
    const sw = readFileSync('src/ui/pwa/sw.js', 'utf8').replace('__CACHE__', `uu-${hash}`).replace('__PRECACHE__', JSON.stringify(precache));
    writeFileSync(join(outdir, 'sw.js'), sw);
  }
  const size = (readFileSync(join(outdir, js)).length / 1024).toFixed(0);
  console.log(`${outdir}: ${js} ${size} KB, ${artIds.length} art files${dev ? ' (dev)' : ''}`);
}

function walk(dir, prefix = '') {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(join(dir, e.name), `${prefix}${e.name}/`) : [`${prefix}${e.name}`]);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  await buildClient({ dev: process.argv.includes('--dev'), serverUrl: process.env.SERVER_URL });
}
