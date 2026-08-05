/*
 * Service Worker の登録と「あたらしい ばん があります」のお知らせ。
 *
 * ⚠️ この処理を React の useEffect の中に置いてはいけない。
 *    effect は描画のあとに走るため、そのとき load はもう終わっている。
 *    window.addEventListener('load', ...) はリスナーが付くだけで二度と呼ばれず、
 *    Service Worker が黙って登録されないままになる。
 *    「もう load が済んでいるか」を必ず見る。
 */

// 利用者が「さいしんに する」を押したかどうか。
//
// ⚠️ controllerchange は、はじめて開いたときにも飛んでくる。
//    activate の clients.claim() でページが管理下に入るためである。
//    これを素直に受けると初回訪問が必ず1回リロードされ、
//    並べたばかりの盤面が消える。
//
// ⚠️ 「もともと管理下だったか」で分ける直し方は別の形で壊れる。
//    入れた直後に更新を押した場合、切り替わったのに読み込み直されなくなる。
//    見るべきは「利用者が押したかどうか」だけ。
let userAskedUpdate = false;
let reloading = false;

function showUpdateToast(worker) {
  if (document.querySelector('.update-toast')) return;

  const toast = document.createElement('div');
  toast.className = 'update-toast';
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');

  const text = document.createElement('span');
  text.textContent = 'あたらしい ばん が あります';

  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'さいしんに する';
  button.addEventListener('click', () => {
    userAskedUpdate = true;
    button.disabled = true;
    worker.postMessage({ type: 'SKIP_WAITING' });
  });

  toast.append(text, button);
  document.body.appendChild(toast);
}

async function register() {
  let registration;
  try {
    registration = await navigator.serviceWorker.register(
      `${import.meta.env.BASE_URL}sw.js`,
      { scope: import.meta.env.BASE_URL }
    );
  } catch (err) {
    // 登録できなくてもゲームは動く。オフラインで開けなくなるだけ。
    console.warn('[pwa] service worker の登録に失敗しました', err);
    return;
  }

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!userAskedUpdate || reloading) return;
    reloading = true;
    location.reload();
  });

  registration.addEventListener('updatefound', () => {
    const sw = registration.installing;
    if (!sw) return;
    sw.addEventListener('statechange', () => {
      // controller が居る＝初回インストールではなく更新。
      // 初回で通知すると「入れた直後に更新があります」と出て混乱する。
      if (sw.state === 'installed' && navigator.serviceWorker.controller) {
        showUpdateToast(sw);
      }
    });
  });

  // 前回の訪問のうちに新しい版が待機していた場合も拾う
  if (registration.waiting && navigator.serviceWorker.controller) {
    showUpdateToast(registration.waiting);
  }
}

export function initPwa() {
  if (!('serviceWorker' in navigator)) return;
  // 開発サーバーには sw.js が無いので登録しない
  if (!import.meta.env.PROD) return;

  // load が済んでいるならその場で走らせる
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}
