# GIGAクアルト！ (GIGA Quarto!)

React と Three.js で制作された、3Dボードゲーム「クアルト！」のWebアプリ版です。
「パクパクゴブレット」のような親しみやすいデザインと、直感的な3D操作が特徴です。

## 🚀 デプロイ先 (Live Demo)
[https://GIGAyama.github.io/Quarto/](https://GIGAyama.github.io/Quarto/)

## 🎮 ゲームの概要
4x4の盤面に、共通の属性（色・形・高さ・穴の有無）を持つコマを並べていく対戦型ボードゲームです。
通常のゲームと異なり、**「相手が置くコマを自分が選ぶ」**という独特なルールが戦略の鍵となります。

### ルール
以下のいずれかの属性が1列に4つ揃えば勝利です。
- **形**: 丸 または 四角
- **色**: 白 または 黒
- **高さ**: 高い または 低い
- **穴**: 穴あり または 穴なし

## 📱 PWA対応
本アプリはPWA (Progressive Web App) に対応しています。
- Chrome・Edge などのブラウザから **「アプリとしてインストール」** できます（アドレスバーのインストールアイコン、またはメニューの「アプリをインストール」）。
- スマートフォンでは「ホーム画面に追加」でアプリのように起動できます。
- 一度読み込めばオフラインでもプレイできます（Service Workerによるキャッシュ）。
- スマートフォン・タブレットの縦持ち／横持ちどちらでも、盤面が大きく見えるようレイアウトが自動で切り替わります。

## 🛠 使用技術 (Tech Stack)
- **Frontend**: React (Vite)
- **3D Engine**: Three.js
- **UI/UX**: Tailwind CSS, SweetAlert2, Canvas-confetti
- **PWA**: vite-plugin-pwa (Workbox)
- **Deployment**: GitHub Actions → GitHub Pages

## 📦 開発環境のセットアップ (Development)

```bash
# 依存関係のインストール
npm install

# ローカル開発サーバーの起動
npm run dev

# コードチェック
npm run lint

# 中核ロジック（勝敗判定）のテスト
npm test

# 本番用ビルド
npm run build

# 静的な品質ゲート（GIGA Standard v5 Part I）
npm run check

# 品質ゲートそのものが動いているかを、わざと壊して確かめる
npm run check:self
```

`npm run lint` → `npm test` → `npm run build` → `npm run check` は
`.github/workflows/ci.yml` が **push と pull_request の両方で**回します。

## 🔬 実ブラウザでの実測

読むだけでは分からないもの（コントラスト・タップ領域・CSP違反・Service Worker の挙動）は、
実際にブラウザで開いて測ります。測り方と実測値は [AUDIT.md](./AUDIT.md) にあります。

```bash
npm run build
npm run serve:dist &     # dist/ を本番と同じ /Quarto/ の下で配る
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
| `src/App.jsx` | 3D エンジンと画面 |
| `src/pwa.js` | Service Worker の登録と「あたらしい ばん が あります」のお知らせ |
| `src/sw.js` | Service Worker 本体（`injectManifest` でビルドされる） |
| `public/install-hook.js` | `beforeinstallprompt` の捕捉。`<head>` の先頭で同期読み込みする |
| `public/offline.html` | 圏外で本体の控えも無いときに出る画面。外部資産にも JS にも頼らない |
| `assets/icon-master.png` | アイコンの原本（1024×1024）。**配布物には含めない** |
| `scripts/check-project.mjs` | 品質ゲート |
| `tools/measure*.mjs` | 実ブラウザでの実測 |

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

手動でデプロイしたい場合は `npm run deploy` (gh-pages ブランチへのビルド済み成果物の公開) も利用できます。

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
