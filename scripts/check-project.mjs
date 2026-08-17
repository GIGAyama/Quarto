#!/usr/bin/env node
/*
 * 品質ゲート。
 *
 *   npm run check              … リポジトリを検査する
 *   npm run check -- --self-test … 検査そのものが動いていることを確かめる
 *
 * ⚠️ 「0件でした」だけでは、検査が動いているのか何も見ていないのか区別できない。
 *    --self-test は各検査に「わざと壊した入力」を与えて、ちゃんと落ちることを見る。
 *    実際にこの確認をしたことで、検査そのものの不具合が見つかっている。
 *
 * 検査の中身は scripts/lib/giga-v5-checks.mjs にある。
 * 共通の正本（scripts/lib/project-quality.mjs）を受け取れるようになったら、
 * このファイルが両者を合成する形にする。
 */
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checks } from './lib/giga-v5-checks.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SELF_TEST = process.argv.includes('--self-test');

// assets/ はアイコンの原本置き場で配布物ではない。dist/assets は検査したいので、
// ディレクトリ名ではなくリポジトリからの相対パスで除外する。
const IGNORED = new Set(['node_modules', '.git', 'dev-dist', 'assets']);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const rel = relative(ROOT, full);
    if (IGNORED.has(rel)) continue;
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else out.push(rel);
  }
  return out;
}

// --- 実際のリポジトリから読む文脈 ------------------------------------------
function realContext() {
  const files = walk(ROOT);
  const cache = new Map();
  const config = JSON.parse(readFileSync(join(ROOT, 'quality.config.json'), 'utf8'));

  return {
    config,
    // '.js' のような拡張子はきっちり末尾で一致させる。
    // 部分一致にすると package-lock.json が '.js' に引っかかる。
    // ビルド成果物（dist/）は原本ではないので、明示的に dist を指したときだけ含める。
    list: (pattern) => {
      const base = pattern && pattern.includes('dist') ? files : files.filter((f) => !f.startsWith('dist/'));
      if (!pattern) return base;
      if (/^\.[a-z0-9]+$/i.test(pattern)) return base.filter((f) => f.endsWith(pattern));
      return base.filter((f) => f.includes(pattern));
    },
    has: (p) => existsSync(join(ROOT, p)),
    bytes: (p) => (existsSync(join(ROOT, p)) ? statSync(join(ROOT, p)).size : null),
    text: (p) => {
      if (cache.has(p)) return cache.get(p);
      const full = join(ROOT, p);
      const v = existsSync(full) && statSync(full).isFile() ? readFileSync(full, 'utf8') : null;
      cache.set(p, v);
      return v;
    },
    iconAlpha: (p) => {
      const full = join(ROOT, p);
      if (!existsSync(full)) return null;
      // PNG のヘッダだけを読む。IHDR の colour type が 4 か 6 なら alpha を持つ。
      // tRNS チャンクがあるパレット PNG も透明を持つ。
      const buf = readFileSync(full);
      const colourType = buf[25];
      const hasAlphaChannel = colourType === 4 || colourType === 6;
      const hasTrns = buf.includes(Buffer.from('tRNS'));
      return { hasTransparent: hasAlphaChannel || hasTrns, min: hasAlphaChannel ? 'alpha あり' : hasTrns ? 'tRNS あり' : 255 };
    }
  };
}

// --- わざと壊した文脈 ------------------------------------------------------
// 各検査 id ごとに「これなら落ちるはず」という入力を用意する。
const BREAKAGE = {
  A1_LICENSE: (o) => ({ ...o, has: (p) => (p === 'LICENSE' ? false : o.has(p)) }),
  A2_GITIGNORE: (o) => ({ ...o, text: (p) => (p === '.gitignore' ? 'node_modules/\n' : o.text(p)) }),
  A3_DEPENDABOT: (o) => ({ ...o, has: (p) => (p === '.github/dependabot.yml' ? false : o.has(p)) }),
  A4_DOCS: (o) => ({ ...o, has: (p) => (p === 'MANUAL.md' ? false : o.has(p)) }),
  A6_TESTS_EXIST: (o) => ({ ...o, list: (g) => (g === '.test.js' ? [] : o.list(g)) }),
  A5_CI_ON_PR: (o) => ({
    ...o,
    text: (p) => (p.startsWith('.github/workflows/') ? 'on:\n  push:\n    branches: [main]\n' : o.text(p))
  }),
  B1_CSP: (o) => ({
    ...o,
    text: (p) =>
      p === 'index.html'
        ? `<meta http-equiv="Content-Security-Policy" content="script-src 'self' 'unsafe-inline';">`
        : o.text(p)
  }),
  B2_NO_META_FRAME_ANCESTORS: (o) => ({
    ...o,
    text: (p) =>
      p === 'index.html'
        ? `<meta http-equiv="Content-Security-Policy" content="frame-ancestors 'none';">`
        : o.text(p)
  }),
  B6_NO_CDN_RUNTIME: (o) => ({
    ...o,
    text: (p) =>
      p === 'index.html'
        ? '<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>'
        : o.text(p)
  }),
  B7_NO_SECRETS: (o) => ({ ...o, list: (g) => o.list(g).concat(['.clasp.json']) }),
  D1_VIEWPORT: (o) => ({
    ...o,
    text: (p) =>
      p === 'index.html' ? '<meta name="viewport" content="width=device-width, initial-scale=1.0">' : o.text(p)
  }),
  D14_NO_SCALE_LOCK: (o) => ({
    ...o,
    text: (p) =>
      p === 'index.html'
        ? '<meta name="viewport" content="width=device-width, user-scalable=no">'
        : o.text(p)
  }),
  // ⚠️ @supports not (height: 100dvh) の中の 100vh は正しいフォールバック。
  //    わざと壊すときは「@supports に囲まれていない 100vh」を与える。
  D2_DVH: (o) => ({
    ...o,
    text: (p) => (p.endsWith('.css') ? '.app { height: 100vh; }' : o.text(p))
  }),
  D3_SAFE_AREA: (o) => ({ ...o, text: (p) => (/\.(css|jsx|html)$/.test(p) ? '.a{}' : o.text(p)) }),
  D4_FLUID_TYPE: (o) => ({ ...o, text: (p) => (p.endsWith('.css') ? 'body{font-size:16px}' : o.text(p)) }),
  D5_CANVAS_DPR: (o) => ({
    ...o,
    text: (p) => (p.endsWith('.jsx') ? "const ctx = el.getContext('2d');" : o.text(p))
  }),
  D10_REDUCED_MOTION: (o) => ({
    ...o,
    text: (p) =>
      p.endsWith('.css')
        ? '@media (prefers-reduced-motion: reduce) {\n  * { animation-duration: 0s !important; }\n}'
        : o.text(p)
  }),
  D11_FORCED_COLORS: (o) => ({ ...o, text: (p) => (p.endsWith('.css') ? '.a{}' : o.text(p)) }),
  F4_RT_COLOR: (o) => ({ ...o, text: (p) => (p.endsWith('.css') ? 'rt { color: #666; }' : o.text(p)) }),
  E1_MANIFEST_ID: (o) => ({
    ...o,
    text: (p) => (p === 'vite.config.js' ? "start_url: './', scope: './'" : o.text(p))
  }),
  E2_APPLE_ICON_OPAQUE: (o) => ({ ...o, iconAlpha: () => ({ hasTransparent: true, min: 0 }) }),
  E3_INSTALL_HOOK: (o) => ({
    ...o,
    text: (p) =>
      p === 'index.html'
        ? '<head><script type="module" src="/src/main.jsx"></script><script src="./install-hook.js"></script></head>'
        : o.text(p)
  }),
  // ⚠️ 削除式を正規表現で追うと (k) => caches.delete(k) を見落とす。
  //    見るべきは「startsWith で絞る式があるか」なので、それを外して壊す。
  E5_SW_CACHE_SCOPE: (o) => ({
    ...o,
    text: (p) =>
      p === o.config.swSource
        ? "self.addEventListener('activate', async () => { const keys = await caches.keys(); await Promise.all(keys.map((k) => caches.delete(k))); });"
        : o.text(p)
  }),
  E6_SW_NO_LOCALSTORAGE: (o) => ({
    ...o,
    text: (p) => (p === o.config.swSource ? "localStorage.setItem('a', '1');" : o.text(p))
  }),
  E7_SW_NO_SKIP_WAITING_ON_INSTALL: (o) => ({
    ...o,
    text: (p) =>
      p === o.config.swSource
        ? "self.addEventListener('install', (e) => { self.skipWaiting(); });\nself.addEventListener('activate', () => {});"
        : o.text(p)
  }),
  E10_OFFLINE_HTML: (o) => ({
    ...o,
    text: (p) => (p === o.config.offlineHtml ? '<html><script>location.reload()</script></html>' : o.text(p))
  }),
  E11_APP_VERSION: (o) => ({
    ...o,
    text: (p) => (p === o.config.swSource ? "const APP_VERSION = 'v0';" : o.text(p))
  }),
  P1_ICON_SIZES: (o) => ({ ...o, bytes: () => 999 * 1024 }),
  P2_FILE_SIZE: (o) => ({ ...o, text: (p) => (p.endsWith('.jsx') ? 'x\n'.repeat(6000) : o.text(p)) }),
  P3_INITIAL_JS: (o) => ({
    ...o,
    list: (g) => (g === 'dist/assets/' ? ['dist/assets/a.js'] : o.list(g)),
    bytes: () => 9_000_000
  })
};

// ---------------------------------------------------------------------------
function runSelfTest() {
  const base = realContext();
  let failed = 0;

  console.log('検査そのものを、わざと壊した入力で確かめる\n');
  for (const check of checks) {
    const breaker = BREAKAGE[check.id];
    if (!breaker) {
      console.log(`⚠️  ${check.id.padEnd(34)} わざと壊す入力が用意されていない`);
      failed++;
      continue;
    }
    let r;
    try {
      r = check.run(breaker(base));
    } catch (e) {
      console.log(`❌ ${check.id.padEnd(34)} 検査が例外で落ちた: ${e.message}`);
      failed++;
      continue;
    }
    if (r.skip) {
      console.log(`❌ ${check.id.padEnd(34)} 壊したのに「対象外」と判定された`);
      failed++;
    } else if (r.ok) {
      console.log(`❌ ${check.id.padEnd(34)} 壊したのに通ってしまった（検査が何も見ていない）`);
      failed++;
    } else {
      console.log(`✅ ${check.id.padEnd(34)} 壊すとちゃんと落ちる`);
    }
  }

  console.log(`\n${checks.length - failed}/${checks.length} の検査が、壊したときに落ちることを確認した`);
  if (failed) process.exitCode = 1;
}

function runChecks() {
  const ctx = realContext();
  const deviations = ctx.config.knownDeviations || {};
  let ng = 0;
  let skipped = 0;
  const deviated = [];

  console.log('GIGA Standard v5 品質ゲート\n');
  for (const check of checks) {
    let r;
    try {
      r = check.run(ctx);
    } catch (e) {
      r = { ok: false, detail: `検査が例外で落ちた: ${e.message}` };
    }

    if (r.skip) {
      console.log(`➖ [${check.phase}] ${check.title} — ${r.detail}`);
      skipped++;
    } else if (r.ok) {
      console.log(`✅ [${check.phase}] ${check.title} — ${r.detail}`);
    } else if (deviations[check.id]) {
      console.log(`⚠️  [${check.phase}] ${check.title} — ${r.detail}`);
      console.log(`     既知の逸脱: ${deviations[check.id]}`);
      deviated.push(check.id);
    } else {
      console.log(`❌ [${check.phase}] ${check.title} — ${r.detail}`);
      ng++;
    }
  }

  const passed = checks.length - ng - skipped - deviated.length;
  console.log(
    `\n満たした ${passed} / 満たしていない ${ng} / 既知の逸脱 ${deviated.length} / 対象外 ${skipped}`
  );
  if (deviated.length) {
    console.log(`既知の逸脱（AUDIT.md に理由を書いてある）: ${deviated.join(', ')}`);
  }
  if (ng) process.exitCode = 1;
}

if (SELF_TEST) runSelfTest();
else runChecks();
