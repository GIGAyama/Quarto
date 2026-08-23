/*
 * 検査用の簡易サーバー。dist/ を本番と同じ階層に置いて配る。
 *
 *   node tools/serve-dist.mjs [ポート]
 *
 * 本番（quarto.giga-school.com）はドメイン直下なので BASE も '/' にしてある。
 * 配る階層が本番とずれると資産の URL が全部ずれて「壊れている」ように見えるので、
 * 本番と同じ階層に置くのが要点。
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
// 本番と同じ「ドメイン直下」で配る。独自ドメイン quarto.giga-school.com では
// アプリがドメイン直下に置かれるので、旧構成の '/Quarto/' の下で配ると、
// 本番では 404 になるパスが測定環境でだけ通り、壊れていても「合格」と出る。
const BASE = '/';
const PORT = Number(process.argv[2] || 4173);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2'
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  let pathname = decodeURIComponent(url.pathname);

  // BASE が '/' のときにここで飛ばすと、飛ばした先がまた '/' になり、
  // ブラウザは ERR_TOO_MANY_REDIRECTS で止まる。
  // 「アプリが開けない・エラー画面が出る」ように見えるが、原因はこのサーバー側にある。
  // BASE を '/Quarto/' のような下の階層へ戻したときだけ、入口へ案内する。
  if (BASE !== '/' && pathname === '/') {
    res.writeHead(302, { Location: BASE });
    res.end();
    return;
  }
  if (!pathname.startsWith(BASE)) {
    res.writeHead(404).end('not found');
    return;
  }

  let rel = normalize(pathname.slice(BASE.length));
  if (rel === '' || rel === '.' || rel.endsWith('/')) rel = join(rel, 'index.html');
  if (rel.startsWith('..')) {
    res.writeHead(403).end('forbidden');
    return;
  }

  const file = join(DIST, rel);
  try {
    const s = await stat(file);
    if (!s.isFile()) throw new Error('not a file');
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file)] || 'application/octet-stream',
      // Service Worker の更新を実測するため、控えを残させない
      'Cache-Control': 'no-cache'
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('not found');
  }
});

server.listen(PORT, () => {
  console.log(`serving dist/ at http://localhost:${PORT}${BASE}`);
});
