import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { ErrorBoundary } from './ErrorScreen.jsx'
import { initPwa } from './pwa.js'
// 自己ホストした Zen Maru Gothic（生成物。node tools/fonts/build-fonts.mjs で作り直す）。
import './fonts.css'
import './index.css'

// Service Worker の登録は React の外（モジュールの一番外側）で行う。
// useEffect の中に入れると load を取りこぼして黙って登録されなくなる。
initPwa()

// ⚠️ 以前ここには loadDisplayFont() があった。fonts.googleapis.com を
//    media="print" で足して load 後に差し替える、40 行の回避策である。
//    塞がれ方が「握ったまま返さない」だと、読み込み中のスタイルシートが残って
//    React が永久に動き出さなかったため（2026-08-23 の「アプリが開けない」）。
//    書体を自分のところから配るようになり、回避する相手そのものが消えたので
//    src/font.js ごと削除した。ここに外部から読む仕組みを戻さないこと。

// ErrorBoundary は StrictMode の内側に置く。
// 外側だと、StrictMode 自体の再マウントで起きた例外を受け止められない。
ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <ErrorBoundary>
            <App />
        </ErrorBoundary>
    </React.StrictMode>,
)
