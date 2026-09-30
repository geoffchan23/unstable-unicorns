import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
const root = process.argv[2] ?? 'dist'; const port = Number(process.argv[3] ?? 5174);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.map': 'application/json' };
const server = createServer((req, res) => {
  let p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (p.endsWith('/')) p += 'index.html';
  const file = join(root, p);
  if (!file.startsWith(join(root)) || !existsSync(file) || statSync(file).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-cache' });
  createReadStream(file).pipe(res);
});
// Node closes an idle keep-alive socket after 5s by default. A phone across the room fetches card art in
// dribs and drabs as cards are dealt, so it keeps hitting a socket the server is closing at that moment and
// the image fails with nothing in the log. Outlast the browser's own idle timeout instead.
server.keepAliveTimeout = 120_000;
server.headersTimeout = 125_000;
server.listen(port, () => console.log(`static ${root} on http://localhost:${port}/`));
