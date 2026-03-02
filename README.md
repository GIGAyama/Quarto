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

## 🛠 使用技術 (Tech Stack)
- **Frontend**: React (Vite)
- **3D Engine**: Three.js
- **UI/UX**: Tailwind CSS, SweetAlert2, Canvas-confetti
- **Deployment**: GitHub Pages

## 📦 開発環境のセットアップ (Development)

```bash
# 依存関係のインストール
npm install

# ローカル開発サーバーの起動
npm run dev

# 本番用ビルド
npm run build

# GitHub Pagesへのデプロイ
npm run deploy
```

## ✒️ 作者
[GIGA山](https://note.com/cute_borage86)
