/**
 * このリポジトリだけの検査。
 *
 * 共通の検査は正本（GIGAyama.github.io/standards/lib/giga-v5-checks.mjs）が
 * 受け持つ。ここに残すのは、正本に対応するものが無いものだけである。
 *
 * 移行のとき（2026-08-23）にフォーク30件を正本38件へ1つずつ突き合わせた。
 * 名前が変わっただけのものと、正本では1つにまとまったもの
 * （B1_CSP と B2_NO_META_FRAME_ANCESTORS → B_CSP、D1_VIEWPORT と
 *  D14_NO_SCALE_LOCK → D_VIEWPORT、E2_APPLE_ICON_OPAQUE → E_ICONS、
 *  A4_DOCS → A_DOCS）を除くと、行き先が無いのは下の5件だった。
 *
 * ⚠️ 検査そのものが壊れていないかは check-project.mjs --self-test が確かめる。
 *    「0件でした」だけでは、効いているのか何も見ていないのか区別できない。
 */
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join, extname } from 'node:path';

const walk = (dir, out = []) => {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
};
const kb = (n) => Math.round((n / 1024) * 10) / 10;

/** 原文を読めば分かるもの。 */
export function runLocalChecks(root) {
  const out = [];
  const add = (id, ok, detail, severity = 'P1') => out.push({ id, ok, detail, severity });

  // 正本の E_SW_* はどれも sw.js の中身を読むので、無ければそちらも落ちる。
  // ただし「なぜ落ちたか」が読み取りにくいので、在ることを名指しで見る。
  const swPath = join(root, 'src/sw.js');
  const hasSw = existsSync(swPath);
  add('E_SW_EXISTS', hasSw, hasSw ? 'src/sw.js' : 'src/sw.js が無い');

  // 正本の E_INSTALL_HOOK は「<head> で合図を受けているか」を見る。
  // 読み込んでいる先のファイルが在るかは見ていないので、ここで見る。
  const hookPath = join(root, 'public/install-hook.js');
  const hasHook = existsSync(hookPath);
  add('E3_INSTALL_HOOK_FILE', hasHook, hasHook ? '' : 'public/install-hook.js が無い');

  // テストが1本も無いのに「テスト通過」と言えてしまう状態を防ぐ。
  const tests = walk(join(root, 'tests')).filter((p) => /\.test\.(m?js|jsx)$/.test(p));
  add('A6_TESTS_EXIST', tests.length > 0,
    tests.length > 0 ? `${tests.length} 本` : 'tests/ にテストが1本も無い');

  return out;
}

/**
 * ビルドした結果を見るもの。
 *
 * このアプリは vite-plugin-pwa の injectManifest を使う。先読み一覧は
 * ビルド時に dist/sw.js へ注入されるので、原文をいくら読んでも中身が
 * 決まらない（正本の E_SW_PRECACHE_OFFLINE は、そのことを宣言してあるかだけを
 * 見て、実際の中身はここに任せている）。
 *
 * dist が無ければ「まだビルドしていない」として落とす。黙って素通りさせると、
 * ビルド結果を見る検査が丸ごと効かないまま緑になる。
 */
export function runBuildChecks(root, config) {
  const out = [];
  const add = (id, ok, detail, severity = 'P1') => out.push({ id, ok, detail, severity });
  const dist = join(root, 'dist');
  if (!existsSync(dist)) {
    add('BUILD_PRESENT', false, 'dist/ がありません。先に npm run build を実行してください');
    return out;
  }
  add('BUILD_PRESENT', true, 'dist/ があります');

  // 圏外で出す1枚が、実際に先読みへ入ったか。
  const distSw = join(dist, 'sw.js');
  if (!existsSync(distSw)) {
    add('E10_OFFLINE_PRECACHED', false, 'dist/sw.js がありません');
  } else {
    const injected = readFileSync(distSw, 'utf8');
    const ok = /offline\.html/.test(injected);
    add('E10_OFFLINE_PRECACHED', ok,
      ok ? '注入された先読みに入っています' : '注入された先読みに offline.html がありません（圏外では出せません）');
  }

  // 初回に要る JavaScript の量。既知の逸脱は quality.config.json に理由つきで書く。
  const total = walk(join(dist, 'assets'))
    .filter((p) => extname(p) === '.js')
    .reduce((n, p) => n + statSync(p).size, 0);
  const limit = config.performance.initialJsKB;
  const within = kb(total) <= limit;
  const deviation = (config.knownDeviations || {}).P3_INITIAL_JS;
  if (!within && deviation) {
    out.push({
      id: 'P3_INITIAL_JS', ok: true, severity: 'P2', deviated: true,
      detail: `${kb(total)}KB (上限 ${limit}KB) — 既知の逸脱: ${deviation}`,
    });
  } else {
    add('P3_INITIAL_JS', within, `${kb(total)}KB (上限 ${limit}KB)`, 'P2');
  }

  return out;
}
