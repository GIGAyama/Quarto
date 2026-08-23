import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { ErrorBoundary } from './ErrorScreen.jsx'
import { initPwa } from './pwa.js'
import { loadDisplayFont } from './font.js'
import './index.css'

// Service Worker の登録は React の外（モジュールの一番外側）で行う。
// useEffect の中に入れると load を取りこぼして黙って登録されなくなる。
initPwa()

// 表示用の Web フォントは、束ねた CSS ではなくここから足す。
// CSS に @import で書くと描画待ちがこのファイルの実行そのものを止め、
// フォントが届かない学校でアプリが起動しなくなる（src/font.js 参照）。
loadDisplayFont()

// ErrorBoundary は StrictMode の内側に置く。
// 外側だと、StrictMode 自体の再マウントで起きた例外を受け止められない。
ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <ErrorBoundary>
            <App />
        </ErrorBoundary>
    </React.StrictMode>,
)
