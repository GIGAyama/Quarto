/*
 * このアプリが使うキャッシュ名の接頭辞。
 *
 * ⚠️ Service Worker（src/sw.js）と画面側の「ためたデータを消す」（src/ErrorScreen.jsx）の
 *    両方が、この接頭辞で「自分のぶんだけ」を選り分ける。
 *    片方だけ書き換えると、消したつもりのものが残る／関係のないものまで消える、
 *    という気づきにくい壊れ方をするので、正本をここ 1か所に置く。
 *
 * ⚠️ 旧配信元の gigayama.github.io は数十個のアプリが同一オリジンを共有していた。
 *    caches.keys() を無条件に消すと、他のアプリがオフラインで起動しなくなる。
 */
export const CACHE_PREFIX = 'giga-quarto-';

/*
 * 登録されている Service Worker が「このアプリのぶん」かを見分ける。
 *
 * ⚠️ import.meta.env.BASE_URL をそのまま scope と突き合わせてはいけない。
 *    vite.config.js の base は './'（相対）なので BASE_URL も './' になる。
 *    一方 registration.scope は 'https://…/' という絶対 URL で、
 *    その pathname は '/' や '/Quarto/' のような絶対パスにしかならない。
 *    '/'.startsWith('./') は必ず false なので、素朴に比べると
 *    「自分のぶんが 1つも見つからない」＝ 1つも消せない、という結果になる。
 *    そのせいで ErrorScreen の「データを けして ひらきなおす」が
 *    Service Worker を残したまま読み込み直し、古い控えが出続けて
 *    エラー画面から抜け出せなくなっていた（2026-08-23）。
 *
 * ⚠️ 比較の前に、必ず両方をページの URL を基準にした絶対パスへ直す。
 *
 * 独自ドメイン（quarto.giga-school.com）では base が '/' になり、
 * このオリジンはこのアプリだけのものなので、全部が「自分のぶん」で正しい。
 * 旧配信元のような共有オリジン（…/Quarto/）に戻したときは、
 * '/Quarto/' で始まる scope だけが選ばれ、同居する他のアプリは巻き込まない。
 */
export function ownsScope(scope, baseUrl, pageUrl) {
  const base = new URL(baseUrl, pageUrl).pathname;
  return new URL(scope, pageUrl).pathname.startsWith(base);
}
