// Static server for web/ under /bioenanos/ (same sub-path as GitHub Pages). No dependencies.
//   node tools/serve.mjs [port]    -> http://localhost:4173/bioenanos/
//   import { startServer } from './tools/serve.mjs'  (tests; port 0 = random)
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const BASE = '/bioenanos/';
const WEB = resolve(fileURLToPath(new URL('../web/', import.meta.url)));
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.map': 'application/json', '.txt': 'text/plain; charset=utf-8', '.ico': 'image/x-icon',
};

function handler(req, res) {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/' || url.pathname === '/bioenanos') {
    res.writeHead(302, { Location: BASE }).end();
    return;
  }
  if (!url.pathname.startsWith(BASE)) {
    res.writeHead(404).end('Not under /bioenanos/');
    return;
  }
  let rel = decodeURIComponent(url.pathname.slice(BASE.length));
  if (rel === '' || rel.endsWith('/')) rel += 'index.html';
  const file = normalize(join(WEB, rel));
  if (file !== WEB && !file.startsWith(WEB + sep)) {
    res.writeHead(403).end();
    return;
  }
  let st;
  try {
    st = statSync(file);
  } catch {
    res.writeHead(404).end('Not found');
    return;
  }
  if (!st.isFile()) {
    res.writeHead(404).end('Not found');
    return;
  }
  res.writeHead(200, {
    'Content-Type': TYPES[extname(file).toLowerCase()] ?? (extname(file) === '' ? 'text/plain; charset=utf-8' : 'application/octet-stream'),
    'Content-Length': st.size,
    'Cache-Control': 'no-cache',
  });
  if (req.method === 'HEAD') res.end();
  else createReadStream(file).pipe(res);
}

/** Start the server; resolves to {server, port, url}. */
export function startServer(port = 4173, host = '127.0.0.1') {
  return new Promise((ok, fail) => {
    const server = createServer(handler);
    server.once('error', fail);
    server.listen(port, host, () => {
      const p = server.address().port;
      ok({ server, port: p, url: `http://localhost:${p}${BASE}` });
    });
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.argv[2] ?? process.env.PORT ?? 4173);
  const { url } = await startServer(port, process.env.HOST ?? '127.0.0.1');
  console.log(`Serving web/ at ${url}`);
}
