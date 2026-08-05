import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { initPwa } from './pwa.js'
import './index.css'

// Service Worker の登録は React の外（モジュールの一番外側）で行う。
// useEffect の中に入れると load を取りこぼして黙って登録されなくなる。
initPwa()

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>,
)
