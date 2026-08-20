/*
 * 実ブラウザでの実測（GIGA Standard v5 §7）。読むだけでは分からないものを測る。
 *
 *   npm run build
 *   node tools/serve-dist.mjs &            # dist/ を /Quarto/ の下で配る
 *   npm i -D playwright                    # ← このリポジトリの依存には入れていない
 *   node tools/measure.mjs
 *
 * Playwright を devDependencies に入れていないのは、授業で使うアプリの
 * npm ci を重くしたくないため。測るときだけ入れる。
 *
 * 測るもの:
 *   1. コントラスト（全画面・全要素）
 *   2. タップ領域 44px（::after 込み）
 *   3. CSP 違反・JS エラー
 *   4. 320px 幅で横スクロールが出ないか
 *   5. Service Worker（登録・初回リロード・更新の待機・他アプリのキャッシュ・オフライン）
 */
import { chromium, devices } from 'playwright';

const ORIGIN = process.env.MEASURE_ORIGIN || 'http://localhost:4173';
const URL_APP = `${ORIGIN}/`;

const results = [];
const record = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

// ---------------------------------------------------------------------------
// 画面の中で色を測るコード（ページ側で走る）
// ---------------------------------------------------------------------------
// 色を読むための共通部分。CONTRAST_SCAN と、図形のしるしの計測で使い回す。
const CONTRAST_HELPERS = `
  // ⚠️ Tailwind v4 などは色を oklch() で書き出す。数字だけ拾うと
  //    oklch(0.554 0.046 257.417) を rgb(0.554, 0.046, 257.417) と読み違え、
  //    どの要素も「ほぼ真っ黒」と判定されて比が 1.0 付近になる。
  //    1px 実際に塗って getImageData で読むのがいちばん確実。
  const cv = document.createElement('canvas');
  cv.width = cv.height = 1;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  const parse = (s) => {
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = '#000';
    ctx.fillStyle = s;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    const a = d[3] / 255;
    return a === 0 ? [0, 0, 0, 0] : [d[0] / a, d[1] / a, d[2] / a, a];
  };

  const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const over = (fg, bg) => {
    const a = fg[3];
    return [fg[0] * a + bg[0] * (1 - a), fg[1] * a + bg[1] * (1 - a), fg[2] * a + bg[2] * (1 - a), 1];
  };
  const ratio = (a, b) => {
    const l1 = lum(a), l2 = lum(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };

  // 絵文字はフォント自身の色で描かれ、CSS の color が効かない。除外しないと誤報になる。
  const EMOJI = /\\p{Extended_Pictographic}/u;

  // 背景をたどる。グラデーション背景は backgroundColor が透明になるので、
  // backgroundImage も見ないと「白の上の白（比 1.0）」という誤報が出る。
  const bgOf = (el) => {
    let node = el, acc = [255, 255, 255, 1];
    const stack = [];
    while (node && node !== document.documentElement.parentNode) {
      const cs = getComputedStyle(node);
      const c = parse(cs.backgroundColor);
      if (c[3] > 0) stack.push(c);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') {
        // グラデーションの実際の色は取れない。下地として不透明とみなし、
        // ここでたどるのをやめる（親の白と混ぜて楽観的な数字を出さない）。
        const m = cs.backgroundImage.match(/(rgba?\\([^)]*\\)|#[0-9a-f]{3,8})/i);
        if (m) stack.push(parse(m[1]));
        break;
      }
      node = node.parentElement;
    }
    for (let i = stack.length - 1; i >= 0; i--) acc = over(stack[i], acc);
    return acc;
  };
`;

const CONTRAST_SCAN = `(() => {
  ${CONTRAST_HELPERS}
  const bad = [];
  for (const el of document.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) continue;

    // 使用不可の状態は WCAG の対象外。濃くすると「もう済んだもの」が押せるように見える。
    if (el.disabled || cs.cursor === 'not-allowed' || el.getAttribute('aria-disabled') === 'true') continue;

    const text = Array.from(el.childNodes)
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent.trim())
      .join('');
    if (!text) continue;
    if (EMOJI.test(text)) continue;

    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) continue;

    const fg = over(parse(cs.color), bgOf(el));
    const bg = bgOf(el);
    const r = ratio(fg, bg);

    const px = parseFloat(cs.fontSize);
    const weight = Number(cs.fontWeight) || 400;
    const isLarge = px >= 24 || (px >= 18.66 && weight >= 700);
    const need = isLarge ? 3 : 4.5;

    if (r < need) {
      bad.push({
        text: text.slice(0, 24),
        tag: el.tagName.toLowerCase(),
        cls: (el.className && el.className.baseVal !== undefined ? el.className.baseVal : String(el.className || '')).slice(0, 60),
        color: cs.color,
        fontSize: px,
        ratio: Math.round(r * 100) / 100,
        need
      });
    }
  }
  return bad;
})()`;

const TAP_SCAN = `(() => {
  const bad = [];
  const targets = document.querySelectorAll('a[href], button, input, select, textarea, [role="button"]');
  for (const el of targets) {
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) continue;
    if (el.disabled) continue;

    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) continue;

    // ::after で当たり判定だけを広げている場合があるので、疑似要素の実効サイズも見る
    let w = rect.width, h = rect.height;
    for (const pseudo of ['::after', '::before']) {
      const ps = getComputedStyle(el, pseudo);
      if (ps.content === 'none') continue;
      const pw = parseFloat(ps.minWidth) || 0;
      const ph = parseFloat(ps.minHeight) || 0;
      if (ps.position === 'absolute') { w = Math.max(w, pw); h = Math.max(h, ph); }
    }

    if (w < 44 || h < 44) {
      bad.push({
        text: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 24),
        tag: el.tagName.toLowerCase(),
        w: Math.round(w * 10) / 10,
        h: Math.round(h * 10) / 10
      });
    }
  }
  return bad;
})()`;

// ---------------------------------------------------------------------------
async function main() {
  // 環境に置いてある Chromium を使いたい場合は PW_CHROMIUM で指すことができる
  const browser = await chromium.launch(
    process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}
  );

  // === 1〜4. 表示の実測 ===============================================
  for (const [label, viewport] of [
    ['320×568（設計の下限）', { width: 320, height: 568 }],
    ['375×667（iPhone SE）', { width: 375, height: 667 }],
    ['1366×768（Chromebook）', { width: 1366, height: 768 }]
  ]) {
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2 });
    const page = await ctx.newPage();

    const cspViolations = [];
    const jsErrors = [];
    page.on('console', (m) => {
      const t = m.text();
      if (/Content Security Policy|Refused to/i.test(t)) cspViolations.push(t);
    });
    page.on('pageerror', (e) => jsErrors.push(String(e)));

    await page.goto(URL_APP, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);

    const scrollX = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    record(`[${label}] 横スクロールが出ない`, scrollX <= 0, `はみ出し ${scrollX}px`);

    // ルール説明を開いた状態も測る（モーダルの中がいちばん見落とされる）
    const screens = [];
    screens.push({ name: '通常画面', bad: await page.evaluate(CONTRAST_SCAN), tap: await page.evaluate(TAP_SCAN) });

    // ルール説明は4枚続く。1枚ずつ歩いて、全部測る。
    await page.click('button[aria-label="ルールを見る"]');
    for (let i = 1; i <= 4; i++) {
      await page.waitForSelector('.swal2-popup');
      await page.waitForTimeout(400);
      screens.push({
        name: `ルール説明 ${i}/4`,
        bad: await page.evaluate(CONTRAST_SCAN),
        tap: await page.evaluate(TAP_SCAN)
      });
      await page.click('.swal2-confirm');
      await page.waitForTimeout(300);
    }
    await page.waitForSelector('.swal2-popup', { state: 'detached' });

    // 「最初から」の確認ダイアログ
    await page.click('button:has-text("から")');
    await page.waitForSelector('.swal2-popup');
    await page.waitForTimeout(400);
    screens.push({ name: 'やりなおす確認', bad: await page.evaluate(CONTRAST_SCAN), tap: await page.evaluate(TAP_SCAN) });

    // 勝ち・引き分けのポップアップは対局を最後まで進めないと出ないので、
    // 開いているポップアップの中に同じしるしを実際に差し込んで測る。
    // 色はライブラリのスタイルシートから計算されるため、本番と同じ値になる。
    await page.evaluate(() => {
      const host = document.querySelector('.swal2-popup');
      const mk = (kind, inner) => {
        const d = document.createElement('div');
        d.className = `swal2-icon swal2-${kind} swal2-icon-show measure-injected`;
        d.style.display = 'flex';
        d.innerHTML = inner;
        host.appendChild(d);
      };
      mk('info', '<div class="swal2-icon-content">i</div>');
      mk('warning', '<div class="swal2-icon-content">!</div>');
      mk(
        'success',
        '<span class="swal2-success-line-tip"></span><span class="swal2-success-line-long"></span><div class="swal2-success-ring"></div>'
      );
      mk('error', '<span class="swal2-x-mark-line-left"></span><span class="swal2-x-mark-line-right"></span>');
    });
    await page.waitForTimeout(200);
    screens.push({
      name: 'ポップアップのしるし（勝ち・引き分け含む）',
      bad: await page.evaluate(CONTRAST_SCAN),
      tap: []
    });

    // しるしの線は文字ではなく図形なので、背景色として別に測る（基準は 3:1）
    const marks = await page.evaluate(`(() => {
      ${CONTRAST_HELPERS}
      const popup = getComputedStyle(document.querySelector('.swal2-popup'));
      const bg = parse(popup.backgroundColor);
      const out = [];
      for (const sel of ['.swal2-success-line-tip', '.swal2-x-mark-line-left']) {
        const el = document.querySelector('.measure-injected ' + sel);
        if (!el) continue;
        const c = over(parse(getComputedStyle(el).backgroundColor), bg);
        out.push({ sel, color: getComputedStyle(el).backgroundColor, ratio: Math.round(ratio(c, bg) * 100) / 100 });
      }
      return out;
    })()`);
    record(
      `[${label}] 勝ち・エラーのしるし（図形）3:1 以上`,
      marks.every((m) => m.ratio >= 3),
      JSON.stringify(marks)
    );

    await page.evaluate(() => document.querySelectorAll('.measure-injected').forEach((n) => n.remove()));

    // Esc で閉じられることも、ここで同時に確かめている
    await page.keyboard.press('Escape');
    await page.waitForSelector('.swal2-popup', { state: 'detached' });

    for (const s of screens) {
      record(
        `[${label}] ${s.name}: コントラスト 4.5:1 未満`,
        s.bad.length === 0,
        s.bad.length ? JSON.stringify(s.bad) : '0件'
      );
      record(
        `[${label}] ${s.name}: タップ領域 44px 未満`,
        s.tap.length === 0,
        s.tap.length ? JSON.stringify(s.tap) : '0件'
      );
    }

    record(`[${label}] CSP 違反`, cspViolations.length === 0, cspViolations.join(' / ') || '0件');
    record(`[${label}] JS エラー`, jsErrors.length === 0, jsErrors.join(' / ') || '0件');

    await ctx.close();
  }

  // === 5. PWA の挙動 ==================================================
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await ctx.newPage();

  // 他アプリのキャッシュを2つ置いてから開き、巻き添えで消えないかを見る
  await page.goto(`${ORIGIN}/offline.html`);
  await page.evaluate(async () => {
    await caches.open('townmap-mikke-static-v1');
    await caches.open('keisan-card-static-v3');
  });

  let navigations = 0;
  page.on('framenavigated', (f) => {
    if (f === page.mainFrame()) navigations++;
  });

  await page.goto(URL_APP, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  const reg = await page.evaluate(async () => {
    const r = await navigator.serviceWorker.getRegistration();
    return r ? { scope: r.scope, active: !!r.active, waiting: !!r.waiting } : null;
  });
  record('Service Worker が登録されている', !!reg && reg.active, JSON.stringify(reg));

  // まっさらな状態で1回開いたときの画面遷移。1回なら正常、2回なら勝手にリロードしている。
  record('初回訪問で勝手にリロードしない', navigations === 1, `画面遷移 ${navigations}回`);

  const cacheNames = await page.evaluate(() => caches.keys());
  record(
    '他アプリのキャッシュが残っている',
    cacheNames.includes('townmap-mikke-static-v1') && cacheNames.includes('keisan-card-static-v3'),
    JSON.stringify(cacheNames)
  );
  record(
    '自アプリのキャッシュ接頭辞が付いている',
    cacheNames.some((n) => n.startsWith('giga-quarto-')),
    JSON.stringify(cacheNames.filter((n) => n.startsWith('giga-quarto-')))
  );

  // 圏外にして再読み込み。手元の控えで起動できるか。
  await ctx.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  const bootedOffline = await page.evaluate(
    () => !!document.querySelector('#root') && document.querySelectorAll('#root *').length > 0
  );
  record('圏外でも起動する', bootedOffline, bootedOffline ? '盤面まで描画された' : '描画されなかった');

  // 本体の控えだけ消してから圏外で開くと offline.html が出るか
  await ctx.setOffline(false);
  await page.evaluate(async () => {
    for (const name of await caches.keys()) {
      if (!name.startsWith('giga-quarto-')) continue;
      const c = await caches.open(name);
      for (const req of await c.keys()) {
        if (/\/(index\.html)?$/.test(new URL(req.url).pathname)) await c.delete(req);
      }
    }
  });
  await ctx.setOffline(true);
  await page.goto(URL_APP, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(800);
  const offlineShown = await page.evaluate(() =>
    document.body.textContent.includes('インターネットに つながっていません')
  );
  record('本体の控えが無いときは offline.html が出る', offlineShown, offlineShown ? '表示された' : '出なかった');

  await ctx.setOffline(false);
  await browser.close();

  // ---------------------------------------------------------------------
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} 件が基準を満たした`);
  if (failed.length) {
    console.log('\n満たしていないもの:');
    for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
