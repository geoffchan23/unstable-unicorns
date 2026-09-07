import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

mkdirSync('dist', { recursive: true });
const result = await build({
  entryPoints: ['src/ui/main.tsx'],
  bundle: true,
  minify: true,
  format: 'iife',
  target: 'es2020',
  write: false,
  define: { 'process.env.NODE_ENV': '"production"' },
  jsx: 'automatic',
});
const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = readFileSync('src/ui/styles.css', 'utf8');
const tpl = readFileSync('src/ui/template.html', 'utf8');
const html = tpl.replace('/*__CSS__*/', () => css).replace('/*__JS__*/', () => js);
writeFileSync('dist/unstable-unicorns.html', html);
// a standalone page for local testing
writeFileSync('dist/index.html', `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${html.replace('<div id="root">', '</head><body><div id="root">')}</body></html>`);
console.log(`dist/unstable-unicorns.html ${(html.length / 1024).toFixed(0)} KB`);
