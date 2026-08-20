# GIGAクアルト！ (GIGA Quarto!)

> ### ⚠️ 非公式アプリです（原作へのクレジット）
> **本アプリは、ボードゲーム『クアルト！（Quarto!）』（考案 Blaise Müller、発売元 Gigamic）のルールを題材にした、個人制作の非公式アプリです。権利者とは一切関係がありません。**
> ルール（アイデア）そのものに著作権はありませんが、**駒やパッケージの意匠・ロゴは権利者のもの**です。
> なお、ラテン文字表記の **QUARTO は第9類（ソフトウェア）で別の権利者による商標登録があります**（登録第6441647号）。英語表記でのアプリ名の使用は避けてください。


React と Three.js で制作された、3Dボードゲーム「クアルト！」のWebアプリ版です。
**1台の端末を2人で囲んで対戦する**、授業でそのまま使える教材アプリです。
「パクパクゴブレット」のような親しみやすいデザインと、直感的な3D操作が特徴です。

## 🚀 デプロイ先 (Live Demo)
[https://quarto.giga-school.com/](https://quarto.giga-school.com/)

## 🎮 ゲームの概要

4×4の盤面に、**16個のコマ**（色・形・高さ・穴の4属性の全組み合わせ）を交互に置いていく対戦型ボードゲームです。
通常のゲームと異なり、**「相手が置くコマを自分が選ぶ」**という独特なルールが戦略の鍵となります。

### ルール

たて4本・よこ4本・ななめ2本の **合計10本** のうちどれか1本で、
以下の**いずれか1つの属性**が4つ揃った時点で勝ちです。

- **形**: 丸 または 四角
- **色**: 白 または 黒
- **高さ**: 高い または 低い
- **穴**: 穴あり または 穴なし

**揃えたコマが誰のものかは関係ありません。最後にコマを「置いた人」が勝ちです。**
そのため、相手に渡すコマの選び方がこのゲームの中心になります。
16個すべてを置いても揃わなかったときは引き分けです。

対戦相手はコンピュータではなく、**同じ端末を使うもう1人の人間**です（AI対戦・通信対戦はありません）。

## ✨ アプリでできること

| 場所 | できること |
|---|---|
| 盤面（3D） | 1本指でなぞると盤面が回ります。2本指のピンチ（PCはホイール）で寄り引きできます |
| 盤面（3D） | **その場でぽんと押す**とコマを選ぶ／置く。動かしたり長押ししたりすると「回す」操作になります |
| ヘッダー「⬇ いれる」 | 端末にアプリとしてインストールします。ブラウザが案内できるときだけ出ます |
| ヘッダー「🔲 大きく」 | 提示モード。全画面＋文字150%。電子黒板向けに**横幅640px以上の画面でだけ**出します |
| ヘッダー「🔊 ON / 🔇 OFF」 | 効果音の切り替え（音は Web Audio API で合成しており、音声ファイルは持ちません） |
| ヘッダー「？」 | ルールを4枚の絵で見せるポップアップ |
| 操作パネル | いまの手番と、次にすることの案内（`aria-live` で読み上げにも流します） |
| 操作パネル「最初から」 | 確認のうえ盤面をリセット |
| 画面下の帯 | 新しい版が用意できたときの「あたらしい ばん が あります」。**押すまで切り替わりません** |
| オフライン画面 | 一度も開いていない端末で圏外のとき、`offline.html` を出します |

**このアプリは対局結果を一切保存せず、外部にも一切送信しません。**
`localStorage` を使っておらず、起動後の通信も発生しません（CSP の `connect-src` は `'self'` のみ）。

### 既知の制限

- **盤面のコマの選択・配置は、タップ／クリックのみです**（キーボードの代替手段がありません）。
  ヘッダー・操作パネル・ポップアップは Tab キーで操作できます。詳細は [AUDIT.md](./AUDIT.md) の F3 にあります。
- 初回に読み込む JS は **702KB（gzip後 196KB）** で、GIGA Standard v5 の 300KB を満たしていません。
  3D 盤面の three.js が 451KB を占めるためで、`quality.config.json` の `knownDeviations` に理由を書いてあります。

## 📱 PWA対応
本アプリはPWA (Progressive Web App) に対応しています。
- Chrome・Edge などのブラウザから **「アプリとしてインストール」** できます。
  条件が揃うと**アプリ内のヘッダーに「⬇ いれる」ボタン**が出るほか、
  アドレスバーのインストールアイコン、またはメニューの「アプリをインストール」からも入れられます。
- iPad・iPhone (Safari) には「⬇ いれる」は出ません。共有ボタンから「ホーム画面に追加」を使います。
- 一度読み込めばオフラインでもプレイできます（Service Workerによるキャッシュ）。
- スマートフォン・タブレットの縦持ち／横持ちどちらでも、盤面が大きく見えるようレイアウトが自動で切り替わります
  （縦持ちは盤面の奥に2列、横持ちは盤面の左右に8個ずつコマを並べます）。

## 🛠 使用技術 (Tech Stack)
- **Frontend**: React 18 (Vite 5)
- **3D Engine**: Three.js (OrbitControls)
- **UI/UX**: Tailwind CSS, SweetAlert2, Canvas-confetti
- **PWA**: vite-plugin-pwa (`injectManifest` + 自前の `src/sw.js`)
- **Test**: `node --test`（Node 標準のテストランナー。追加の依存なし）
- **Icon**: sharp（`npm run icons` のときだけ使う）
- **Deployment**: GitHub Actions → GitHub Pages

## 📦 開発環境のセットアップ (Development)

```bash
# 依存関係のインストール
npm install

# ローカル開発サーバーの起動
npm run dev

# コードチェック
npm run lint

# 中核ロジック（勝敗判定）のテスト … 10件
npm test

# 本番用ビルド
npm run build

# ビルド結果をローカルで確認
npm run preview

# 静的な品質ゲート（GIGA Standard v5 Part I）… 30項目
npm run check

# 品質ゲートそのものが動いているかを、わざと壊して確かめる
npm run check:self
```

`npm run check` は現在 **満たした 29 / 満たしていない 0 / 既知の逸脱 1（初回JS 702KB）** で通ります。
逸脱として扱う項目と理由は `quality.config.json` の `knownDeviations` に書いてあり、毎回その数字が表示されます。

`npm run lint` → `npm test` → `npm run build` → `npm run check` は
`.github/workflows/ci.yml` が **push（main）と pull_request の両方で**回します。

## 🔬 実ブラウザでの実測

読むだけでは分からないもの（コントラスト・タップ領域・CSP違反・Service Worker の挙動）は、
実際にブラウザで開いて測ります。測り方と実測値は [AUDIT.md](./AUDIT.md) にあります。

```bash
npm run build
npm run serve:dist &     # dist/ を本番と同じ /Quarto/ の下（http://localhost:4173/Quarto/）で配る
npm i -D playwright      # ← 依存には入れていない。測るときだけ入れる
npm run measure          # 表示・コントラスト・タップ・CSP・SW・オフライン
npm run measure:update   # 更新が「押すまで切り替わらない」ことの確認
```

Playwright を `devDependencies` に入れていないのは、授業で使うアプリの `npm ci` を
重くしたくないためです。

## 🏗 このリポジトリの作り

| ファイル | 役割 |
|---|---|
| `src/game.js` | 盤面と勝敗判定。画面にも three.js にも依存しない（ここだけテストがある） |
| `tests/*.test.js` | `npm test`（`node --test`）が拾うテスト。この名前で置く |
| `src/App.jsx` | 3D エンジンと画面。Three.js のラッパと React の UI が両方入っている |
| `src/main.jsx` | エントリポイント。React の起動と `initPwa()` の呼び出し |
| `src/index.css` | Tailwind の読み込みと、fluid type・タップ領域・提示モード・印刷などの自前の指定 |
| `src/pwa.js` | Service Worker の登録と「あたらしい ばん が あります」のお知らせ |
| `src/sw.js` | Service Worker 本体（`injectManifest` でビルドされる） |
| `index.html` | CSP・viewport・アイコン・`install-hook.js` の読み込み |
| `vite.config.js` | ビルド設定と PWA マニフェスト（`base: '/Quarto/'`） |
| `public/install-hook.js` | `beforeinstallprompt` の捕捉。`<head>` の先頭で同期読み込みする |
| `public/offline.html` | 圏外で本体の控えも無いときに出る画面。外部資産にも JS にも頼らない |
| `assets/icon-master.png` | アイコンの原本（1024×1024）。**配布物には含めない** |
| `quality.config.json` | 品質ゲートの設定（版・上限サイズ・既知の逸脱） |
| `scripts/check-project.mjs` | 品質ゲートの実行と自己テスト（`--self-test`） |
| `scripts/lib/giga-v5-checks.mjs` | 検査そのものの中身（30項目） |
| `scripts/generate-icons.mjs` | `npm run icons`。アイコン6種類の生成 |
| `tools/serve-dist.mjs` | `npm run serve:dist`。`dist/` を `/Quarto/` の下で配る簡易サーバー |
| `tools/measure.mjs`, `tools/measure-update.mjs` | 実ブラウザでの実測（Playwright） |

### 手を入れるときの注意

- **CSP を入れてあります。** インラインの `<script>` と `onclick=` は動きません。
  イベントは `addEventListener` で繋いでください。
- **`src/sw.js` を直したら `APP_VERSION` を上げ、`quality.config.json` の
  `appVersion` も合わせてください。** ずれていると `npm run check` が落ちます。
- **アイコンの色や大きさの上限は `quality.config.json` にあります。**
- 検査を足したときは、`scripts/check-project.mjs` の `BREAKAGE` に
  「わざと壊した入力」も足してください。壊しても落ちない検査は、何も見ていないのと同じです。

## 🚢 デプロイ (Deployment)
`main` ブランチにプッシュすると、GitHub Actions (`.github/workflows/deploy.yml`) が
自動でビルドして GitHub Pages にデプロイします。

> **注意**: リポジトリの Settings → Pages → 「Build and deployment」の Source が
> **「GitHub Actions」** になっている必要があります。
> （「Deploy from a branch」のままだと、ビルド前のソースがそのまま配信されて動きません）

`npm run deploy`（`gh-pages` ブランチへのビルド済み成果物の公開）も残してありますが、
**上記のとおり Source が「GitHub Actions」のときは `gh-pages` ブランチは配信に使われません。**
`npm run deploy` を使うのは、Source を「Deploy from a branch → gh-pages」に切り替える場合だけです。

### PWAアイコンの再生成
原本は `assets/icon-master.png` (1024×1024) です。差し替えたら次を走らせてください。

```bash
npm run icons
```

`public/` に置かれる6種類（favicon / 192 / 512 / apple-touch-icon / maskable 192・512）が
パレット PNG で作り直されます。合計 **42.3 KB** です。

- `apple-touch-icon` は**透明を含みません**。iOS は透明を黒で埋めるため、
  透明のある画像を指すとホーム画面でアイコンの四隅が黒く出ます。
- maskable は下地を端まで伸ばしてあります（余白を残すと、欠けはしないが縮んで見えます）。
  セーフゾーン外の中身は 512 で 0.012%、192 で 0.024% です。

## 📋 品質基準

このリポジトリは **GIGA Standard v5** に沿って作られています。
実測値・満たしていない項目・**測っていないもの**は [AUDIT.md](./AUDIT.md) に全部書いてあります。
先生向けの使い方は [MANUAL.md](./MANUAL.md) です。

## ✒️ 作者
[GIGA山](https://note.com/cute_borage86)
