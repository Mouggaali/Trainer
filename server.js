// Minimal static dev server (no dependencies). Usage: node server.js [port]
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = Number(process.argv[2] || process.env.PORT || 5173);
const ROOT = __dirname;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};
// Serve only what the GitHub Pages deploy publishes (.github/workflows/deploy.yml). The server also listens on the
// LAN, so .env, supabase/ (secrets from tools/make-vapid.js), tools/, .git/ … must never be reachable; dot-names
// (dotfiles, NTFS tricks like "..::$INDEX_ALLOCATION") are refused too.
const PUBLIC = new Set(['index.html', 'manifest.webmanifest', 'sw.js', 'css', 'js', 'icons', 'fonts']);

http.createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = path.normalize(path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath));
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) { res.writeHead(403); return res.end(); }
  const parts = path.relative(ROOT, file).split(path.sep);
  if (!PUBLIC.has(parts[0]) || parts.some((p) => p.startsWith('.'))) { res.writeHead(404); return res.end('Not found'); }
  fs.stat(file, (err, stat) => {
    if (!err && stat.isDirectory()) file = path.join(file, 'index.html');
    fs.readFile(file, (err2, data) => {
      if (err2) { res.writeHead(404); return res.end('Not found'); }
      res.writeHead(200, {
        'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(data);
    });
  });
}).listen(PORT, '0.0.0.0', () => {
  console.log(`Trainer draait op http://localhost:${PORT}`);
  for (const nets of Object.values(os.networkInterfaces())) {
    for (const n of nets || []) {
      if (n.family === 'IPv4' && !n.internal) console.log(`Op je telefoon (zelfde wifi): http://${n.address}:${PORT}`);
    }
  }
});
