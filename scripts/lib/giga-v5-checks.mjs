/*
 * GIGA Standard v5 Part I の検査。
 *
 * 各検査は { id, title, phase, run(ctx) } の形で、
 * run は { ok, detail } か { skip, detail } を返す。
 *
 * ctx が持つもの:
 *   text(path)   … リポジトリ内のファイルの中身（無ければ null）
 *   has(path)    … ファイルがあるか
 *   list(glob)   … 単純なパターンに一致するファイルの一覧
 *   bytes(path)  … ファイルの大きさ（無ければ null）
 *   config       … quality.config.json
 *   iconAlpha(path) … PNG に透明が含まれるか（無ければ null）
 *
 * 検査を足したときは、必ず self-test（scripts/check-project.mjs --self-test）にも
 * 「わざと壊した入力」を足すこと。0件でしたという結果だけでは、
 * 検査が動いているのか何も見ていないのか区別できない。
 */

// 判定の前にコメントを落とす。
// 「localStorage は操作しない」といった注意書きに反応して誤検知した例がある。
export const stripComments = (src) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

// 行番号を保ったままコメントを空にする。
// 「100vh はモバイルのアドレスバー分だけはみ出す」といった説明文に
// 検査が反応してしまうのを防ぐ。
const blankComments = (src, kind) => {
  const pat = kind === 'html' ? /<!--[\s\S]*?-->/g : /\/\*[\s\S]*?\*\//g;
  let out = src.replace(pat, (m) => m.replace(/[^\n]/g, ' '));
  if (kind !== 'html') out = out.replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));
  return out;
};

const ok = (detail) => ({ ok: true, detail });
const ng = (detail) => ({ ok: false, detail });
const skip = (detail) => ({ skip: true, detail });

export const checks = [
  // ---- A. 法務・配布 -----------------------------------------------------
  {
    id: 'A1_LICENSE',
    phase: 'P0',
    title: 'LICENSE が実ファイルとして置いてある',
    run: (c) => (c.has('LICENSE') ? ok('あり') : ng('LICENSE が無い'))
  },
  {
    id: 'A2_GITIGNORE',
    phase: 'P0',
    title: '.gitignore が node_modules / dist / .env を除外している',
    run: (c) => {
      const t = c.text('.gitignore') || '';
      const missing = ['node_modules', 'dist', '.env'].filter((k) => !t.includes(k));
      return missing.length ? ng(`除外されていない: ${missing.join(', ')}`) : ok('あり');
    }
  },
  {
    id: 'A3_DEPENDABOT',
    phase: 'P0',
    title: '.github/dependabot.yml がある',
    run: (c) => (c.has('.github/dependabot.yml') ? ok('あり') : ng('無い'))
  },
  {
    id: 'A4_DOCS',
    phase: 'P3',
    title: 'README / MANUAL / AUDIT がそろっている',
    run: (c) => {
      const missing = ['README.md', 'MANUAL.md', 'AUDIT.md'].filter((f) => !c.has(f));
      return missing.length ? ng(`無い: ${missing.join(', ')}`) : ok('3つともあり');
    }
  },
  {
    id: 'A6_TESTS_EXIST',
    phase: 'P4',
    title: '中核ロジックのテストが少なくとも1つある',
    run: (c) => {
      // `npm test`（node --test）は、対象のファイルが1つも無くても 0 で終わる。
      // テストが消えたことに CI が気づけないので、ここで存在を見る。
      const t = c.list('.test.js').filter((f) => f.startsWith('tests/'));
      return t.length ? ok(`${t.length} ファイル`) : ng('tests/ に *.test.js が無い');
    }
  },
  {
    id: 'A5_CI_ON_PR',
    phase: 'P0',
    title: 'CI が pull_request でも動く',
    run: (c) => {
      const files = c.list('.github/workflows/');
      const hit = files.some((f) => /pull_request/.test(c.text(f) || ''));
      return hit ? ok('pull_request で動く') : ng('push だけでは PR の時点で落ちていることに気づけない');
    }
  },

  // ---- B. セキュリティ・依存 ---------------------------------------------
  {
    id: 'B1_CSP',
    phase: 'P1',
    title: 'CSP が入っていて、script-src に unsafe-inline が無い',
    run: (c) => {
      // 説明のコメントに 'unsafe-inline' と書いてあるだけで落ちないよう、先にコメントを空にする
      const html = blankComments(c.text('index.html') || '', 'html');
      if (!/Content-Security-Policy/i.test(html)) return ng('CSP が無い');
      const m = html.match(/script-src[^;]*/i);
      if (!m) return ng('script-src が無い');
      const directive = m[0].replace(/\s+/g, ' ').trim();
      if (/unsafe-inline|unsafe-eval/.test(directive)) return ng(`script-src が緩い: ${directive}`);
      return ok(directive);
    }
  },
  {
    id: 'B2_NO_META_FRAME_ANCESTORS',
    phase: 'P1',
    title: 'frame-ancestors を <meta> に書いていない',
    run: (c) => {
      const html = c.text('index.html') || '';
      const meta = html.match(/<meta[^>]*Content-Security-Policy[\s\S]*?>/i);
      if (!meta) return ok('CSP の meta が無い');
      return /frame-ancestors/.test(meta[0])
        ? ng('meta で配ると無視され、読み込みのたびに警告が出るだけになる')
        : ok('書かれていない');
    }
  },
  {
    id: 'B6_NO_CDN_RUNTIME',
    phase: 'P0.5',
    title: 'CDN から取る実行コードが 0 バイト',
    run: (c) => {
      const hits = [];
      for (const f of c.list('.html').concat(c.list('.js'), c.list('.jsx'))) {
        const t = c.text(f) || '';
        for (const pat of ['@babel/standalone', 'cdn.tailwindcss.com', 'unpkg.com', 'cdn.jsdelivr.net', 'cdnjs.cloudflare.com']) {
          if (t.includes(pat)) hits.push(`${f}: ${pat}`);
        }
      }
      return hits.length ? ng(hits.join(' / ')) : ok('0件');
    }
  },
  {
    id: 'B7_NO_SECRETS',
    phase: 'P0',
    title: '秘密情報らしきファイルがコミットされていない',
    run: (c) => {
      const hits = c.list('').filter((f) => /(^|\/)(\.env|\.clasp\.json)$/.test(f));
      return hits.length ? ng(`ファイル名のみ報告: ${hits.join(', ')}`) : ok('0件');
    }
  },

  // ---- D. 表示 -----------------------------------------------------------
  {
    id: 'D1_VIEWPORT',
    phase: 'P1',
    title: 'viewport に viewport-fit=cover がある',
    run: (c) => {
      const html = c.text('index.html') || '';
      const m = html.match(/<meta[^>]*name=["']viewport["'][^>]*>/i);
      if (!m) return ng('viewport が無い');
      return /viewport-fit=cover/.test(m[0]) ? ok(m[0].trim()) : ng(m[0].trim());
    }
  },
  {
    id: 'D14_NO_SCALE_LOCK',
    phase: 'P1',
    title: '拡大を禁止していない（user-scalable=no / maximum-scale が無い）',
    run: (c) => {
      const hits = [];
      for (const f of c.list('.html').concat(c.list('.gs'))) {
        const t = c.text(f) || '';
        if (/user-scalable\s*=\s*no|maximum-scale/.test(t)) hits.push(f);
      }
      return hits.length ? ng(`見えづらい子が拡大できなくなる: ${hits.join(', ')}`) : ok('0件');
    }
  },
  {
    id: 'D2_DVH',
    phase: 'P1',
    title: '100vh を単独で使っていない',
    run: (c) => {
      const bad = [];
      for (const f of c.list('.css').concat(c.list('.html'), c.list('.jsx'))) {
        const t = blankComments(c.text(f) || '', f.endsWith('.html') ? 'html' : 'code');
        const lines = t.split('\n');
        lines.forEach((line, i) => {
          if (!/100vh/.test(line)) return;
          // ⚠️ @supports not (height: 100dvh) { … 100vh } は正しいフォールバック。
          //    その行だけを見ると誤検知するので、前の方も見る。
          const before = lines.slice(Math.max(0, i - 6), i).join('\n');
          if (/@supports\s+not/.test(before)) return;
          if (/100dvh/.test(line)) return;
          bad.push(`${f}:${i + 1}`);
        });
      }
      return bad.length ? ng(bad.join(', ')) : ok('0件');
    }
  },
  {
    id: 'D3_SAFE_AREA',
    phase: 'P1',
    title: 'safe-area-inset を使っている',
    run: (c) => {
      const n = c.list('.css').concat(c.list('.jsx'), c.list('.html'))
        .filter((f) => /safe-area-inset/.test(c.text(f) || '')).length;
      return n ? ok(`${n} ファイル`) : ng('ノッチ・ホームバーの下に中身が潜る');
    }
  },
  {
    id: 'D4_FLUID_TYPE',
    phase: 'P1',
    title: 'clamp() による fluid type がある',
    run: (c) => {
      const n = c.list('.css').filter((f) => /clamp\(/.test(c.text(f) || '')).length;
      return n ? ok(`${n} ファイル`) : ng('固定 px は 320px ではみ出し、電子黒板では小さい');
    }
  },
  {
    id: 'D5_CANVAS_DPR',
    phase: 'P1',
    title: 'Canvas / WebGL に devicePixelRatio の補正（上限2）がある',
    run: (c) => {
      const files = c.list('.js').concat(c.list('.jsx'));
      const uses = files.filter((f) => /getContext\(['"]2d|WebGLRenderer/.test(c.text(f) || ''));
      if (!uses.length) return skip('Canvas を使っていない');
      const bad = uses.filter((f) => {
        const t = c.text(f) || '';
        return !/Math\.min\(\s*(window\.)?devicePixelRatio[^)]*,\s*2\s*\)/.test(t);
      });
      return bad.length ? ng(`補正が無い: ${bad.join(', ')}`) : ok(`${uses.length} ファイル`);
    }
  },
  {
    id: 'D10_REDUCED_MOTION',
    phase: 'P1',
    title: 'prefers-reduced-motion に対応し、.01ms であって 0 でない',
    run: (c) => {
      for (const f of c.list('.css')) {
        const t = c.text(f) || '';
        const m = t.match(/@media\s*\(prefers-reduced-motion[\s\S]*?\n\}/);
        if (!m) continue;
        // 0 にすると animation-fill-mode: forwards が効かなくなり、
        // fadeIn 系の要素が opacity: 0 のまま消える。
        if (/animation-duration:\s*0s?\s*!/.test(m[0])) return ng(`${f}: 0 だと中身が消える`);
        return ok(f);
      }
      return ng('対応が無い');
    }
  },
  {
    id: 'D11_FORCED_COLORS',
    phase: 'P1',
    title: 'forced-colors に対応している',
    run: (c) => {
      const n = c.list('.css').filter((f) => /forced-colors/.test(c.text(f) || '')).length;
      return n ? ok(`${n} ファイル`) : ng('背景色が無効化されると押せる場所が分からなくなる');
    }
  },
  {
    id: 'F4_RT_COLOR',
    phase: 'P1',
    title: 'ふりがな（rt）の色を決め打ちしていない',
    run: (c) => {
      const files = c.list('.css');
      const withRt = files.filter((f) => /(^|\})\s*rt\s*\{/m.test(c.text(f) || ''));
      if (!withRt.length) return skip('rt の指定が無い');
      const bad = withRt.filter((f) => {
        const t = c.text(f) || '';
        // 色のついた面では継がせる規則があるか
        return !/rt\s*\{\s*color:\s*inherit/.test(t.replace(/\s*\n\s*/g, ' '));
      });
      return bad.length
        ? ng(`色のついたボタンの上で読めなくなる: ${bad.join(', ')}`)
        : ok('色のついた面では継がせている');
    }
  },

  // ---- E. PWA ------------------------------------------------------------
  {
    id: 'E1_MANIFEST_ID',
    phase: 'P1',
    title: 'manifest の id / scope / start_url がリポジトリ名の絶対パス',
    run: (c) => {
      const base = c.config.repoBasePath;
      const src = c.text('vite.config.js') || c.text('manifest.webmanifest') || '';
      const missing = ['id', 'start_url', 'scope'].filter((k) => {
        const m = src.match(new RegExp(`['"]?${k}['"]?\\s*:\\s*['"]([^'"]+)['"]`));
        return !m || m[1] !== base;
      });
      return missing.length
        ? ng(`${base} になっていない: ${missing.join(', ')}`)
        : ok(`3つとも ${base}`);
    }
  },
  {
    id: 'E2_APPLE_ICON_OPAQUE',
    phase: 'P1',
    title: 'apple-touch-icon に透明が含まれていない',
    run: (c) => {
      const p = c.config.icons.appleTouchIcon;
      const a = c.iconAlpha(p);
      if (a === null) return ng(`${p} が無い`);
      return a.hasTransparent
        ? ng(`iOS は透明を黒で埋めるため四隅が黒く出る（最小 alpha=${a.min}）`)
        : ok('透明なし');
    }
  },
  {
    id: 'E3_INSTALL_HOOK',
    phase: 'P1',
    title: 'beforeinstallprompt を <head> の外部ファイルで捕まえている',
    run: (c) => {
      // 説明のコメントに「beforeinstallprompt」と書いてあるだけで
      // 「インラインで書かれている」と誤判定しないよう、先にコメントを空にする
      const html = blankComments(c.text('index.html') || '', 'html');
      const hookFile = c.list('').find((f) => /install-hook\.js$/.test(f));
      if (!hookFile) return ng('install-hook.js が無い');
      if (!/beforeinstallprompt/.test(c.text(hookFile) || '')) return ng(`${hookFile} が合図を受けていない`);
      if (!/install-hook\.js/.test(html)) return ng('index.html から読み込まれていない');
      // src の無い <script> の中に書くと CSP に 'unsafe-inline' が要る
      const inline = html.match(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi) || [];
      if (inline.some((s) => /beforeinstallprompt/.test(s))) return ng('インラインで書かれている');
      const headEnd = html.indexOf('</head>');
      const pos = html.indexOf('install-hook.js');
      const modulePos = html.search(/<script[^>]*type=["']module["']/);
      if (headEnd > -1 && pos > headEnd) return ng('</head> より後にある');
      if (modulePos > -1 && pos > modulePos) return ng('本体の読み込みより後だと合図を取りこぼす');
      return ok('head の先頭側にある');
    }
  },
  {
    id: 'E5_SW_CACHE_SCOPE',
    phase: 'P1',
    title: 'sw.js が自アプリ接頭辞のキャッシュだけを消している',
    run: (c) => {
      const sw = c.config.swSource;
      const raw = c.text(sw);
      if (raw === null) return ng(`${sw} が無い`);
      const src = stripComments(raw);
      if (!/caches\.keys\(\)/.test(src)) return ok('キャッシュを掃除していない');
      // ⚠️ 「消す式」を正規表現で追うと (k) => caches.delete(k) を見落とす。
      //    見るべきは「startsWith で絞る式があるか」。
      return /startsWith\s*\(/.test(src)
        ? ok('startsWith で絞っている')
        : ng('同一オリジンの他アプリのキャッシュまで消える');
    }
  },
  {
    id: 'E6_SW_NO_LOCALSTORAGE',
    phase: 'P1',
    title: 'sw.js が localStorage に触れていない',
    run: (c) => {
      const sw = c.config.swSource;
      const raw = c.text(sw);
      if (raw === null) return ng(`${sw} が無い`);
      // 注意書きのコメントに反応しないよう、判定前にコメントを落とす
      const src = stripComments(raw);
      return /localStorage/.test(src) ? ng('Service Worker から触れてはいけない') : ok('触れていない');
    }
  },
  {
    id: 'E7_SW_NO_SKIP_WAITING_ON_INSTALL',
    phase: 'P1',
    title: 'install の中で skipWaiting していない',
    run: (c) => {
      const sw = c.config.swSource;
      const raw = c.text(sw);
      if (raw === null) return ng(`${sw} が無い`);
      const src = stripComments(raw);
      const m = src.match(/addEventListener\(\s*['"]install['"][\s\S]*?(?=addEventListener\(\s*['"](activate|fetch|message)['"]|$)/);
      if (!m) return ng('install の処理が見つからない');
      return /skipWaiting/.test(m[0])
        ? ng('対戦の途中で画面が入れ替わり、並べたばかりの盤面が消える')
        : ok('押されるまで切り替えない');
    }
  },
  {
    id: 'E10_OFFLINE_HTML',
    phase: 'P1',
    title: 'offline.html があり、外部資産にも JavaScript にも頼っていない',
    run: (c) => {
      const p = c.config.offlineHtml;
      const t = c.text(p);
      if (t === null) return ng(`${p} が無い`);
      if (/<script/i.test(t)) return ng('JavaScript に頼っている');
      if (/https?:\/\//.test(t.replace(/<!--[\s\S]*?-->/g, ''))) return ng('外部の資産を参照している');
      return ok('自前で完結している');
    }
  },
  {
    id: 'E11_APP_VERSION',
    phase: 'P1',
    title: 'sw.js の APP_VERSION が quality.config.json と一致している',
    run: (c) => {
      const raw = c.text(c.config.swSource);
      if (raw === null) return ng('sw.js が無い');
      const m = raw.match(/APP_VERSION\s*=\s*['"]([^'"]+)['"]/);
      if (!m) return ng('APP_VERSION が無い');
      return m[1] === c.config.appVersion
        ? ok(m[1])
        : ng(`sw.js は ${m[1]}、config は ${c.config.appVersion}。リリースのたびに上げる`);
    }
  },

  // ---- 性能 --------------------------------------------------------------
  {
    id: 'P1_ICON_SIZES',
    phase: 'P2',
    title: 'アイコンが上限のサイズに収まっている',
    run: (c) => {
      const bad = [];
      for (const [p, limitKB] of Object.entries(c.config.icons.maxKB)) {
        const b = c.bytes(p);
        if (b === null) {
          bad.push(`${p}: 無い`);
          continue;
        }
        if (b / 1024 > limitKB) bad.push(`${p}: ${(b / 1024).toFixed(1)}KB > ${limitKB}KB`);
      }
      return bad.length ? ng(bad.join(', ')) : ok('すべて上限内');
    }
  },
  {
    id: 'P2_FILE_SIZE',
    phase: 'P3',
    title: '1ファイルが 5,000行 / 400KB を超えていない',
    run: (c) => {
      const bad = [];
      for (const f of c.list('.js').concat(c.list('.jsx'), c.list('.css'), c.list('.html'))) {
        const t = c.text(f) || '';
        const lines = t.split('\n').length;
        const kb = Buffer.byteLength(t) / 1024;
        if (lines > 5000 || kb > 400) bad.push(`${f}: ${lines}行 / ${kb.toFixed(0)}KB`);
      }
      return bad.length ? ng(bad.join(', ')) : ok('すべて収まっている');
    }
  },
  {
    id: 'P3_INITIAL_JS',
    phase: 'P2',
    title: `初回表示に必要な JS（gzip前）が上限内`,
    run: (c) => {
      const files = c.list('dist/assets/').filter((f) => f.endsWith('.js'));
      if (!files.length) return skip('dist が無い（npm run build のあとに測る）');
      const total = files.reduce((s, f) => s + (c.bytes(f) || 0), 0) / 1024;
      const limit = c.config.performance.initialJsKB;
      if (total <= limit) return ok(`${total.toFixed(0)}KB ≤ ${limit}KB`);
      return ng(`${total.toFixed(0)}KB > ${limit}KB`);
    }
  }
];
