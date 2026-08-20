/* eslint-env serviceworker */
/*
 * GIGAクアルト！ Service Worker
 *
 * 【重要】activate では自アプリ以外のキャッシュを削除しない。
 *   旧配信元の gigayama.github.io は数十個のアプリが同一オリジンを共有していた。
 *   同居する配置に戻したときに他アプリを巻き込まないよう、
 *   CACHE_PREFIX で始まるキャッシュだけを掃除する。
 *   caches.keys() を全部消すと、他のアプリがオフラインで起動しなくなる。
 *
 * この Service Worker は localStorage を一切操作しない
 * （Service Worker からは触れないうえ、触れる設計にすると壊れ方が読めなくなる）。
 */

import { CACHE_PREFIX } from './app-cache.js';

const APP_VERSION = 'v3'; // ← リリースごとに必ず上げる
const CACHE_STATIC = CACHE_PREFIX + 'static-' + APP_VERSION;
const CACHE_RUNTIME = CACHE_PREFIX + 'runtime-' + APP_VERSION;

// ビルド時に vite-plugin-pwa が実ファイル一覧（ハッシュ付き）を差し込む。
// 手で並べるとファイル名のハッシュが変わるたびに嘘になるため、生成に任せる。
const PRECACHE_URLS = (self.__WB_MANIFEST || []).map((e) =>
  typeof e === 'string' ? e : e.url
);

const OFFLINE_URL = new URL('offline.html', self.registration.scope).pathname;
const INDEX_URL = new URL('index.html', self.registration.scope).pathname;

self.addEventListener('install', (e) =>
  e.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_STATIC);
      // 1本でも失敗すると addAll 全体が落ちるため、個別に入れる。
      // 校内 Wi-Fi が混んでいて1本だけ取りこぼしても、残りは使える状態にする。
      await Promise.all(
        PRECACHE_URLS.map((u) =>
          cache
            .add(new Request(u, { cache: 'reload' }))
            .catch((err) => console.warn('[sw] precache skipped', u, err))
        )
      );
      // ここでは skipWaiting しない。
      // 対戦の途中で画面が入れ替わると、並べたばかりの盤面が消える。
      // 画面側で「さいしんに する」を押してもらってから切り替える。
    })()
  )
);

self.addEventListener('activate', (e) =>
  e.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(
            (k) =>
              k.startsWith(CACHE_PREFIX) &&
              k !== CACHE_STATIC &&
              k !== CACHE_RUNTIME
          )
          .map((k) => caches.delete(k)) // ← 自アプリ接頭辞のぶんだけ削除
      );
      await self.clients.claim();
    })()
  )
);

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // フォントなど外部は素通し

  // 画面遷移は network-first。更新をすぐ届け、圏外なら手元の控えを出す。
  if (req.mode === 'navigate') {
    e.respondWith(
      (async () => {
        try {
          return await fetch(req);
        } catch {
          return (
            (await caches.match(INDEX_URL)) ||
            (await caches.match(OFFLINE_URL)) ||
            Response.error()
          );
        }
      })()
    );
    return;
  }

  // 静的ファイルは cache-first。校内 Wi-Fi が混んでいても即表示される。
  e.respondWith(
    (async () => {
      const hit = await caches.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      // 失敗応答やリダイレクトを控えに残すと、次から壊れた画面が出続ける
      if (res && res.ok && res.type === 'basic') {
        const copy = res.clone();
        const cache = await caches.open(CACHE_RUNTIME);
        cache.put(req, copy);
      }
      return res;
    })()
  );
});

self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});
