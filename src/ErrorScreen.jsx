/*
 * 「まっ白」よけ。
 *
 * ⚠️ このアプリは 3D 盤面の用意を useEffect の中で行っている。
 *    WebGL が使えない端末では three.js が例外を投げ、React は画面の木を丸ごと外す。
 *    #root が空になり、背景も白いので、利用者からは
 *    「ひらかない・まっ白」としか見えない。原因の手がかりが 1つも画面に残らない。
 *    そこで、投げられた例外を必ずここで受け止めて、代わりに何かを描く。
 *
 * ⚠️ 見た目は Tailwind ではなく style で直に書く。
 *    この画面は「何かが読めていない」ときに出るものなので、
 *    別のファイル（CSS の束）が届いていることを前提にしてはいけない。
 */
import { Component } from 'react';
import { CACHE_PREFIX, ownsScope } from './app-cache.js';

const YELLOW = '#ffca28';
const BROWN = '#5d4037';

/*
 * ためこんだ控えを捨ててから開き直す。
 *
 * ⚠️ 消すのは「このアプリのぶん」だけ。
 *    gigayama.github.io は数十個のアプリが同一オリジンを共有しているため、
 *    getRegistrations() や caches.keys() の結果をまとめて消すと、
 *    関係のないアプリがオフラインで起動しなくなる（src/sw.js と同じ約束）。
 */
async function clearAppData() {
  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(
        registrations
          .filter((r) => ownsScope(r.scope, import.meta.env.BASE_URL, location.href))
          .map((r) => r.unregister())
      );
    }
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k.startsWith(CACHE_PREFIX)).map((k) => caches.delete(k))
      );
    }
  } catch (err) {
    // 消せなくても、開き直すところまでは進める
    console.warn('[app] ためたデータを消せませんでした', err);
  }
  location.reload();
}

const MESSAGES = {
  // 端末側で 3D 表示（WebGL）が切られている。学校の共用端末でよくある。
  webgl: {
    emoji: '🖥️',
    title: 'この タブレットでは 3D が つかえません',
    body: 'ブラウザの「3D ひょうじ（WebGL）」が オフに なっているようです。',
    hint: '先生へ：ブラウザの設定で「ハードウェア アクセラレーション」を有効にしてから、ブラウザを開き直すと直ることがあります。'
  },
  unknown: {
    emoji: '🧩',
    title: 'うまく ひらけませんでした',
    body: 'アプリを よみこむ とちゅうで こまって しまいました。',
    hint: '先生へ：下の「データを けして ひらきなおす」で、古いまま残った控えを捨ててから読み込み直せます。'
  }
};

const buttonBase = {
  border: 0,
  borderRadius: '999px',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontWeight: 700,
  // 児童が押す前提なので、当たり判定は 44px を下回らせない
  minHeight: '44px',
  padding: '10px 24px'
};

export function ErrorScreen({ kind = 'unknown', detail = '' }) {
  const message = MESSAGES[kind] || MESSAGES.unknown;

  return (
    <div
      role="alert"
      style={{
        alignItems: 'center',
        backgroundColor: '#fff9c4',
        color: BROWN,
        display: 'flex',
        fontFamily:
          "'Zen Maru Gothic', 'Hiragino Maru Gothic ProN', 'Yu Gothic UI', system-ui, sans-serif",
        inset: 0,
        justifyContent: 'center',
        padding: '16px',
        position: 'fixed'
      }}
    >
      <div
        style={{
          backgroundColor: '#fff',
          border: `5px solid ${YELLOW}`,
          borderRadius: '20px',
          maxWidth: '480px',
          padding: '24px 20px',
          textAlign: 'center',
          width: '100%'
        }}
      >
        <p aria-hidden="true" style={{ fontSize: '40px', margin: '0 0 8px' }}>
          {message.emoji}
        </p>
        <h1 style={{ fontSize: 'clamp(18px, 3.2vw + 10px, 26px)', margin: '0 0 12px' }}>
          {message.title}
        </h1>
        <p style={{ fontSize: 'clamp(14px, 1.6vw + 9px, 18px)', margin: '0 0 20px' }}>
          {message.body}
        </p>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '10px',
            justifyContent: 'center'
          }}
        >
          <button
            type="button"
            onClick={() => location.reload()}
            style={{ ...buttonBase, backgroundColor: YELLOW, color: BROWN }}
          >
            もういちど ひらく
          </button>
          <button
            type="button"
            onClick={clearAppData}
            style={{
              ...buttonBase,
              backgroundColor: '#fff',
              border: `2px solid ${BROWN}`,
              color: BROWN
            }}
          >
            データを けして ひらきなおす
          </button>
        </div>

        {/* 先生向けの補足。児童には読めなくてよいが、
            #666 まで薄くすると 4.5:1 を割るので落とさない。 */}
        <p
          style={{
            fontSize: 'clamp(12px, 1.0vw + 9px, 14px)',
            margin: '20px 0 0',
            textAlign: 'left'
          }}
        >
          {message.hint}
        </p>

        {/* ⚠️ 何が起きたのかを画面にも残す。
            児童には読めなくてよいが、これが無いと先生から届く報せは
            「エラー画面が出る」だけになり、原因の切り分けができない。
            開発者ツールを開けない端末（配付されたタブレットなど）では、
            画面に出ていることが唯一の手がかりになる。 */}
        {detail ? (
          <p
            style={{
              color: BROWN,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: '12px',
              margin: '10px 0 0',
              opacity: 0.85,
              overflowWrap: 'break-word',
              textAlign: 'left'
            }}
          >
            {detail}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    // 画面には出さないが、先生が開発者ツールを見たときのために残す
    console.error('[app] 画面を描けませんでした', error, info);
  }

  render() {
    return this.state.failed ? <ErrorScreen /> : this.props.children;
  }
}
