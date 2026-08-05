/*
 * PWA アイコンの生成。原本は assets/icon-master.png（1024×1024）。
 *
 *   node scripts/generate-icons.mjs
 *
 * 元の絵は色数が少ないドット絵なので、フルカラーで持つ理由がない。
 * 色数を落としながら、いちばん軽くなった版を選んでパレット PNG にする。
 * favicon に 1024×1024 も要らない（256 で足りる）。
 */
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MASTER = join(ROOT, 'assets/icon-master.png');
const OUT = join(ROOT, 'public');

// アプリの下地色。maskable と apple-touch-icon で透明を塗りつぶすのに使う。
const BG = { r: 255, g: 249, b: 196, alpha: 1 }; // #fff9c4

// 色数を振って、いちばん小さくなったものを採用する。
// ⚠️ 出来上がったバッファをそのまま書くこと。sharp を通して書き直すと
//    パレットが落ちてフルカラーに戻る。
async function writeSmallestPalette(pipeline, dest) {
  let best = null;
  for (const colours of [32, 64, 128, 256]) {
    const buf = await pipeline
      .clone()
      .png({ palette: true, colours, effort: 10, compressionLevel: 9 })
      .toBuffer();
    if (!best || buf.length < best.buf.length) best = { buf, colours };
  }
  writeFileSync(dest, best.buf);
  return best;
}

const results = [];
async function emit(label, pipeline, name) {
  const best = await writeSmallestPalette(pipeline, join(OUT, name));
  results.push({ name, label, colours: best.colours, bytes: best.buf.length });
}

// --- 通常アイコン（透明のまま。ランチャーが好きな形に切り抜く） ---
await emit('favicon', sharp(MASTER).resize(256, 256), 'favicon.png');
await emit('PWA 192', sharp(MASTER).resize(192, 192), 'pwa-192x192.png');
await emit('PWA 512', sharp(MASTER).resize(512, 512), 'pwa-512x512.png');

// --- apple-touch-icon ---
// iOS は透明部分を黒で埋めるため、ホーム画面でアイコンの四隅だけが黒く出る。
// 下地で塗りつぶして、透明を1画素も残さない。
await emit(
  'apple-touch-icon',
  sharp(MASTER).resize(180, 180).flatten({ background: BG }),
  'apple-touch-icon.png'
);

// --- maskable ---
// ランチャーは中央 80% の円より外側を切り落とす。
// 絵は 80% に収め、下地は端まで伸ばす。余白を残すと欠けはしないが縮んで見える。
// 元の絵は下地を持たない（背景が透明な）ドット絵なので、
// 全面を単色の下地で塗ってから絵を中央に重ねれば継ぎ目は出ない。
async function maskable(size) {
  const inner = Math.round(size * 0.8);
  const art = await sharp(MASTER).resize(inner, inner).png().toBuffer();
  return sharp({
    create: { width: size, height: size, channels: 4, background: BG }
  })
    .composite([{ input: art, gravity: 'center' }])
    .flatten({ background: BG });
}

await emit('maskable 192', await maskable(192), 'maskable-192x192.png');
await emit('maskable 512', await maskable(512), 'maskable-512x512.png');

const total = results.reduce((s, r) => s + r.bytes, 0);
for (const r of results) {
  console.log(
    `${r.name.padEnd(24)} ${String(r.colours).padStart(3)}色  ${(r.bytes / 1024).toFixed(1).padStart(7)} KB`
  );
}
console.log(`${'合計'.padEnd(24)}      ${(total / 1024).toFixed(1).padStart(7)} KB`);
