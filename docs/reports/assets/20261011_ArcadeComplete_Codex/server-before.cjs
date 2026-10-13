// Soos Arcade 기획툴 서버. 의존성 없음.
// 실행: node planner/server.js  →  http://localhost:4174/
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 4174;
const ROOT = path.resolve(__dirname, '..');          // C:\soos-arcade
const XOOX = 'C:\\xoox';                              // 수스. 읽기 전용
const DATA = path.join(__dirname, 'data.json');
const BACKUP = path.join(__dirname, 'backup');
const EXPORT = path.join(ROOT, 'docs', '기획서.md');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4', '.glb': 'model/gltf-binary',
};
const IMAGE = /\.(png|jpe?g|webp|gif)$/i;

function inside(base, rel) {
  const p = path.resolve(base, '.' + path.sep + rel);
  return p === base || p.startsWith(base + path.sep) ? p : null;
}

function send(res, code, body, type = 'application/json; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function readBody(req) {
  return new Promise((ok, fail) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => ok(Buffer.concat(chunks).toString('utf8')));
    req.on('error', fail);
  });
}

function stamp() {
  const d = new Date(), z = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}_${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}`;
}

// 저장할 때마다 이전 판을 backup/ 에 남긴다. 최근 50개만 유지.
function backupData() {
  if (!fs.existsSync(DATA)) return;
  fs.mkdirSync(BACKUP, { recursive: true });
  fs.copyFileSync(DATA, path.join(BACKUP, `data_${stamp()}.json`));
  const old = fs.readdirSync(BACKUP).filter(f => f.startsWith('data_')).sort();
  old.slice(0, Math.max(0, old.length - 50)).forEach(f => fs.unlinkSync(path.join(BACKUP, f)));
}

function serveFile(res, file) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, 'not found', 'text/plain; charset=utf-8');
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = decodeURIComponent(url.pathname);
  try {
    if (p === '/api/data' && req.method === 'GET') {
      return send(res, 200, fs.readFileSync(DATA, 'utf8'));
    }
    if (p === '/api/data' && req.method === 'PUT') {
      const text = await readBody(req);
      JSON.parse(text); // 깨진 JSON은 저장하지 않는다
      backupData();
      fs.writeFileSync(DATA, text, 'utf8');
      return send(res, 200, { ok: true });
    }
    if (p === '/api/export' && req.method === 'POST') {
      fs.writeFileSync(EXPORT, await readBody(req), 'utf8');
      return send(res, 200, { ok: true, path: EXPORT });
    }
    if (p === '/api/ls' && req.method === 'GET') {
      const dir = inside(ROOT, url.searchParams.get('dir') || '');
      if (!dir || !fs.existsSync(dir)) return send(res, 404, { files: [] });
      const files = fs.readdirSync(dir).filter(f => IMAGE.test(f)).sort();
      return send(res, 200, { files });
    }
    if (p === '/') { res.writeHead(302, { Location: '/planner/' }); return res.end(); }
    if (p.startsWith('/xoox/')) {
      const f = inside(XOOX, p.slice(6));
      return f ? serveFile(res, f) : send(res, 403, 'no');
    }
    let f = inside(ROOT, p.slice(1));
    if (!f) return send(res, 403, 'no');
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    return serveFile(res, f);
  } catch (e) {
    return send(res, 500, { ok: false, error: String(e.message || e) });
  }
}).listen(PORT, '127.0.0.1', () => {
  console.log(`Soos Arcade 기획툴: http://localhost:${PORT}/`);
});
