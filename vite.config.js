import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      // Service Worker は自前で書く（src/sw.js）。
      // 生成任せ（generateSW + autoUpdate）だと install の中で skipWaiting され、
      // 対戦の途中で勝手に画面が入れ替わって盤面が消える。
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      registerType: 'prompt',
      // 登録は src/pwa.js で行う。自動注入だと readyState の分岐を挟めない。
      injectRegister: null,
      // includeAssets は使わない。public/ のファイルは下の globPatterns で
      // すでに拾えており、両方書くと同じ URL が2回先読みされる。
      manifest: {
        // ⚠️ id / scope / start_url は "./"（＝配信されている場所そのもの）にする。
        //    独自ドメイン quarto.giga-school.com へ移り、アプリはドメイン直下に
        //    置かれている。旧構成（gigayama.github.io/Quarto/）のような
        //    リポジトリ名の絶対パスに戻すと、scope がページの URL を含まなくなり、
        //    manifest ごと無視されて PWA としてインストールできなくなる。
        //
        //    id は省略しないこと。省略すると start_url が代替の識別子になり、
        //    似た構成の別アプリと取り違えられて
        //    「開いたら違うアプリが立ち上がる」事故が起きる。
        //
        //    今回 id を明示したが、省略時の既定値は start_url（= './'）なので
        //    値は変わっていない。すでにインストール済みの端末で別アプリ扱いにはならない。
        id: './',
        start_url: './',
        scope: './',
        name: 'GIGAクアルト！',
        short_name: 'クアルト！',
        description: '3Dボードゲーム「クアルト！」のWebアプリ版。相手に渡すコマを自分が選ぶ、頭を使う4目ならべです。',
        lang: 'ja',
        dir: 'ltr',
        display: 'standalone',
        display_override: ['standalone', 'fullscreen', 'minimal-ui'],
        launch_handler: { client_mode: ['navigate-existing', 'auto'] },
        orientation: 'any',
        background_color: '#fff9c4',
        theme_color: '#ffca28',
        categories: ['education', 'games', 'kids'],
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'maskable-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2,webmanifest}'],
        // three.js のチャンクが 450KB あるので既定の 2MB では収まらない
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024
      }
    })
  ],
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          react: ['react', 'react-dom']
        }
      }
    }
  }
})
