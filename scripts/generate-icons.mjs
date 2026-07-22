import sharp from 'sharp';

const publicDir = new URL('../public', import.meta.url).pathname;
const src = `${publicDir}/favicon.png`;
const out = publicDir;

// 通常アイコン
await sharp(src).resize(192, 192).png().toFile(`${out}/pwa-192x192.png`);
await sharp(src).resize(512, 512).png().toFile(`${out}/pwa-512x512.png`);
await sharp(src).resize(180, 180).png().toFile(`${out}/apple-touch-icon.png`);

// マスカブルアイコン: セーフゾーン確保のため 80% に縮小して背景色でパディング
const padded = await sharp(src)
  .resize(410, 410)
  .extend({
    top: 51, bottom: 51, left: 51, right: 51,
    background: { r: 255, g: 249, b: 196, alpha: 1 } // #fff9c4
  })
  .flatten({ background: { r: 255, g: 249, b: 196 } })
  .png()
  .toBuffer();
await sharp(padded).resize(512, 512).png().toFile(`${out}/maskable-512x512.png`);

console.log('done');
