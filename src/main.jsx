import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { ErrorBoundary } from './ErrorScreen.jsx'
import { initPwa } from './pwa.js'
import './index.css'

// Service Worker の登録は React の外（モジュールの一番外側）で行う。
// useEffect の中に入れると load を取りこぼして黙って登録されなくなる。
initPwa()

// ErrorBoundary は StrictMode の内側に置く。
// 外側だと、StrictMode 自体の再マウントで起きた例外を受け止められない。
ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <ErrorBoundary>
            <App />
        </ErrorBoundary>
    </React.StrictMode>,
)
