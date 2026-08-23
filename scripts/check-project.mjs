#!/usr/bin/env node
/*
 * 品質ゲート。
 *
 *   npm run check       … リポジトリを検査する
 *   npm run check:self  … 検査そのものが動いていることを確かめる
 *
 * ⚠️ 「0件でした」だけでは、検査が動いているのか何も見ていないのか区別できない。
 *    --self-test は、ファイルを1つずつわざと壊した写しを作り、
 *    対応する検査がちゃんと落ちることを確かめる。
 *
 * ## 構成
 *
 *   scripts/lib/giga-v5-checks.mjs … 共通の検査の【正本のコピー】。
 *     GIGAyama.github.io/standards/lib/ からのコピーで、ここでは手を入れない。
 *     直すときは正本を直してから配る（drift ジョブがずれを見張っている）。
 *   scripts/lib/local-checks.mjs   … このリポジトリだけの検査。
 *
 * ここにはかつて「共通の正本 scripts/lib/project-quality.mjs を受け取れる
 * ようになったら合成する」と書いてあった。その計画は取りやめた
 * （2026-08-22 に艦隊を実測した結果、3世代に割れていて丸ごと差し替えで
 * 受けられる形になっていなかった）。共通化は用件ごとの小さな正本で進める。
 *
 * ## ビルドしてから走らせる
 *
 * このアプリは vite-plugin-pwa の injectManifest を使う。manifest も
 * 先読み一覧もビルド時に作られるので、原文だけでは真偽が決まらない。
 * dist が無ければ BUILD_PRESENT が落ちる（黙って素通りさせない）。
 */
import { readFileSync, mkdtempSync, cpSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { runGigaChecks } from './lib/giga-v5-checks.mjs';
import { runLocalChecks, runBuildChecks } from './lib/local-checks.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(readFileSync(join(ROOT, 'quality.config.json'), 'utf8'));

// 正本は { id, title, ok, detail(配列), skipped } を返す。ローカルは
// { id, ok, detail(文字列), severity }。出力をそろえてから並べる。
const collect = (root) => [
  ...runGigaChecks(root, config.standard).map((r) => ({
    id: r.id,
    ok: r.ok,
    skipped: !!r.skipped,
    // 正本は skipped を true/false で返し、理由は title の末尾に付ける。
    // r.skipped をそのまま出すと「true」と表示される。
    detail: r.skipped ? r.title : (r.detail || []).join(' / ') || r.title,
    severity: 'P1',
  })),
  ...runLocalChecks(root).map((r) => ({ ...r, skipped: false })),
  ...runBuildChecks(root, config).map((r) => ({ ...r, skipped: false })),
];

/*
 * わざと壊す一覧。
 * 「この壊し方をしたら、この検査が落ちるはず」を書いてある。
 * 落ちなければ、その検査は何も見ていない。
 */
const BREAKS = [
  {
    id: 'B_NO_CDN_CODE',
    file: 'index.html',
    apply: (s) => s.replace('</head>', '  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>\n  </head>'),
  },
  {
    id: 'D_VIEWPORT',
    file: 'index.html',
    apply: (s) => s.replace('viewport-fit=cover', 'viewport-fit=auto'),
  },
  {
    id: 'D_VIEWPORT',
    file: 'index.html',
    apply: (s) => s.replace('initial-scale=1', 'initial-scale=1, user-scalable=no'),
  },
  {
    id: 'B_CSP',
    file: 'index.html',
    apply: (s) => s.replace("script-src 'self';", "script-src 'self' 'unsafe-inline';"),
  },
  {
    id: 'B_NO_INLINE_SCRIPT',
    file: 'index.html',
    apply: (s) => s.replace('</body>', '<script>window.x = 1;</script>\n</body>'),
  },
  {
    id: 'E_INSTALL_HOOK',
    file: 'index.html',
    apply: (s) => s.replace('<script src="./install-hook.js"></script>', ''),
  },
  {
    id: 'E3_INSTALL_HOOK_FILE',
    file: 'public/install-hook.js',
    remove: true,
  },
  {
    id: 'D_DVH',
    file: 'src/index.css',
    // ⚠️ 正本は「前後250文字に 100dvh があれば、古いブラウザ向けの正しい
    //    ひかえ」と見る。ひかえの無い 100vh を離れた場所に足す形で壊す。
    apply: (s) => `${s}\n.__selftest { height: 100vh; }\n`,
  },
  {
    id: 'D_SAFE_AREA',
    file: 'src/index.css',
    apply: (s) => s.replaceAll('safe-area-inset', 'REMOVED-inset'),
  },
  {
    id: 'D_FLUID_TYPE',
    file: 'src/index.css',
    apply: (s) => s.replace(/clamp\([^)]*\)/g, '18px'),
  },
  {
    id: 'D_REDUCED_MOTION',
    file: 'src/index.css',
    apply: (s) => s.replaceAll('prefers-reduced-motion', 'prefers-REMOVED'),
  },
  {
    id: 'D_FORCED_COLORS',
    file: 'src/index.css',
    apply: (s) => s.replaceAll('forced-colors', 'REMOVED-colors'),
  },
  {
    id: 'E_SW_CACHE_SCOPE',
    file: 'src/sw.js',
    // ⚠️ 「消す式」ではなく「startsWith で自アプリ分に絞る式があるか」を見る
    apply: (s) => s.replace(/k\.startsWith\(CACHE_PREFIX\)/, 'true'),
  },
  {
    id: 'E_SW_NO_LOCALSTORAGE',
    file: 'src/sw.js',
    apply: (s) => `${s}\nself.addEventListener('sync', () => { localStorage.setItem('x', 1); });\n`,
  },
  {
    id: 'E_SW_NO_SKIP_WAITING_ON_INSTALL',
    file: 'src/sw.js',
    apply: (s) => s.replace("self.addEventListener('install',", "self.addEventListener('install', () => self.skipWaiting());\nself.addEventListener('install',"),
  },
  {
    id: 'E_SW_VERSION_GENERATED',
    file: 'src/sw.js',
    // 版を手書きに戻す（目印が消える）
    apply: (s) => s.replace("const APP_VERSION = '__APP_VERSION__';", "const APP_VERSION = 'v4';"),
  },
  {
    id: 'E_SW_PRECACHE_OFFLINE',
    file: 'sw-build.config.json',
    // 先読みをプラグインに任せている宣言を外す
    apply: (s) => s.replace('"precacheManagedByPlugin": true', '"precacheManagedByPlugin": false'),
  },
  {
    id: 'E_OFFLINE_HTML',
    file: 'public/offline.html',
    remove: true,
  },
  {
    id: 'E_OFFLINE_HTML',
    file: 'public/offline.html',
    apply: (s) => s.replace('</body>', '  <script>console.log(1)</script>\n  </body>'),
  },
  {
    id: 'C_NO_LS_CLEAR',
    file: 'src/pwa.js',
    apply: (s) => `${s}\nexport const reset = () => localStorage.clear();\n`,
  },
  {
    id: 'C_NO_POSTMESSAGE_STAR',
    file: 'src/pwa.js',
    apply: (s) => `${s}\nexport const send = (w) => w.postMessage({ a: 1 }, '*');\n`,
  },
  {
    id: 'A_LICENSE',
    file: 'LICENSE',
    remove: true,
  },
  {
    id: 'A_DEPENDABOT',
    file: '.github/dependabot.yml',
    remove: true,
  },
  {
    id: 'A_DOCS',
    file: 'MANUAL.md',
    remove: true,
  },
];

const report = (results) => {
  const failed = results.filter((r) => !r.ok && !r.skipped);
  const deviated = results.filter((r) => r.deviated);
  for (const r of results) {
    const mark = r.skipped ? '－' : r.deviated ? '⚠️ ' : r.ok ? '✅' : '❌';
    console.log(`${mark} [${r.severity}] ${r.id.padEnd(34)} ${r.detail}`);
  }
  console.log(`\n${results.length - failed.length - deviated.length} / ${results.length} 件が基準を満たしています`
    + (deviated.length ? `（既知の逸脱 ${deviated.length} 件。理由は quality.config.json と AUDIT.md）` : ''));
  return failed;
};

const selfTest = () => {
  console.log('== 品質ゲートの自己確認 ==');
  console.log('ファイルをわざと壊した写しを作り、対応する検査が落ちることを確かめます。\n');

  const base = collect(ROOT);
  const baseFailed = base.filter((r) => !r.ok && !r.skipped);
  if (baseFailed.length) {
    console.log('⚠️ もとの状態で落ちている検査があります。先にそちらを直してください。');
    for (const r of baseFailed) console.log(`   ❌ ${r.id} ${r.detail}`);
    return 1;
  }

  let bad = 0;
  for (const brk of BREAKS) {
    const dir = mkdtempSync(join(tmpdir(), 'giga-selftest-'));
    try {
      // dist は消さずに写す。ビルド結果を見る検査（BUILD_PRESENT /
      // E10_OFFLINE_PRECACHED / P3_INITIAL_JS）が「もとの状態で落ちている」に
      // なってしまうため。
      cpSync(ROOT, dir, {
        recursive: true,
        filter: (src) => !/node_modules|\.git$|\.git\/|dev-dist/.test(src),
      });
      const target = join(dir, brk.file);
      if (brk.remove) {
        rmSync(target, { force: true });
      } else {
        const before = readFileSync(target, 'utf8');
        const after = brk.apply(before);
        if (after === before) {
          console.log(`⚠️ ${brk.id.padEnd(34)} 壊し方が当たっていません（対象の文字列が見つからない）`);
          bad++;
          continue;
        }
        writeFileSync(target, after);
      }
      const results = collect(dir);
      const hit = results.find((r) => r.id === brk.id);
      if (!hit) {
        console.log(`⚠️ ${brk.id.padEnd(34)} そんな検査がありません`);
        bad++;
      } else if (hit.ok) {
        console.log(`❌ ${brk.id.padEnd(34)} 壊したのに落ちませんでした（この検査は何も見ていない）`);
        bad++;
      } else {
        console.log(`✅ ${brk.id.padEnd(34)} 壊したら落ちた`);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  console.log(`\n${BREAKS.length - bad} / ${BREAKS.length} 件の検査が、壊したときに落ちることを確認しました。`);
  return bad === 0 ? 0 : 1;
};

if (process.argv.includes('--self-test')) {
  process.exit(selfTest());
}
console.log(`== GIGA Standard v5 品質ゲート（${config.repoName}）==\n`);
process.exit(report(collect(ROOT)).length === 0 ? 0 : 1);
