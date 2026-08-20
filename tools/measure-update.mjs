/*
 * 更新の挙動の実測（GIGA Standard v5 §7-5）。
 *
 *   npm run build
 *   node tools/serve-dist.mjs &
 *   node tools/measure-update.mjs
 *
 * 確かめること:
 *   1. 版を上げて 3秒放置しても waiting のままか（勝手に切り替わらない）
 *   2. そのあいだ画面が読み込み直されないか（打ちかけの状態が消えない）
 *   3. 「さいしんに する」を押したら切り替わり、古いキャッシュが消えるか
 *   4. そのとき他アプリのキャッシュが残っているか
 *
 * dist/sw.js を書き換えるので、必ずビルドしたあとに走らせること。
 */
import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SW = join(ROOT, 'dist/sw.js');
const ORIGIN = process.env.MEASURE_ORIGIN || 'http://localhost:4173';
const URL_APP = `${ORIGIN}/`;

const results = [];
const record = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const original = await readFile(SW, 'utf8');

const browser = await chromium.launch(
  process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}
);
const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
const page = await ctx.newPage();

try {
  // --- 旧版を入れる ---------------------------------------------------
  await page.goto(URL_APP, { waitUntil: 'networkidle' });
  await page.waitForFunction(async () => {
    const r = await navigator.serviceWorker.getRegistration();
    return !!(r && r.active);
  }, null, { timeout: 15000 });

  // 他アプリの控えを置いて、巻き添えで消されないかを見る
  await page.evaluate(() => caches.open('townmap-mikke-static-v1'));

  const before = await page.evaluate(() => caches.keys());
  record('旧版のキャッシュができている', before.some((k) => k === 'giga-quarto-static-v2'), JSON.stringify(before));

  // --- 新版を置く（APP_VERSION を上げる） -----------------------------
  const bumped = original.replace('"v2"', '"v3"').replace("'v2'", "'v3'");
  if (bumped === original) throw new Error('dist/sw.js の APP_VERSION を差し替えられなかった');
  await writeFile(SW, bumped);

  let navigations = 0;
  page.on('framenavigated', (f) => {
    if (f === page.mainFrame()) navigations++;
  });

  await page.evaluate(async () => {
    const r = await navigator.serviceWorker.getRegistration();
    await r.update();
  });

  // 3秒放置。押していないのだから waiting のままでなければならない。
  await page.waitForTimeout(3000);

  const state = await page.evaluate(async () => {
    const r = await navigator.serviceWorker.getRegistration();
    return { waiting: !!r.waiting, active: r.active ? r.active.state : null };
  });
  record('押すまで切り替わらない（3秒放置して waiting のまま）', state.waiting, JSON.stringify(state));
  record('放置中に画面が読み込み直されない', navigations === 0, `画面遷移 ${navigations}回`);

  const toastShown = await page.locator('.update-toast').isVisible().catch(() => false);
  record('更新のお知らせが出ている', toastShown, toastShown ? '「あたらしい ばん が あります」' : '出なかった');

  // --- 押す -----------------------------------------------------------
  const navPromise = page.waitForNavigation({ timeout: 15000 }).catch(() => null);
  await page.click('.update-toast button');
  await navPromise;
  await page.waitForTimeout(1500);

  const after = await page.evaluate(() => caches.keys());
  record('押したら新しい版に切り替わった', after.includes('giga-quarto-static-v3'), JSON.stringify(after));
  record('古い版のキャッシュが消えた', !after.includes('giga-quarto-static-v2'), JSON.stringify(after));
  record(
    '他アプリのキャッシュは残っている',
    after.includes('townmap-mikke-static-v1'),
    JSON.stringify(after)
  );
} finally {
  await writeFile(SW, original); // dist を元に戻す
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} 件が基準を満たした`);
if (failed.length) {
  for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`);
  process.exitCode = 1;
}
