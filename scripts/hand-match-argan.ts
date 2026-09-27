// One-off: Argan Hair Serum — try top-5 strict Openverse candidates
// until one downloads successfully. Run: npx ts-node scripts/hand-match-argan.ts
import * as fs from 'fs';
import * as path from 'path';

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-var-requires
const sharp = require('sharp') as any;

const ROOT = path.resolve(__dirname, '../..');
const OUT_DIR = path.join(ROOT, 'kova', 'public', 'images', 'seed', 'products');
const MANIFEST_PATH = path.join(__dirname, 'products-manifest.json');
const UA = 'kova-demo-seed/1.0 (demo marketplace product images)';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function openverse(q: string) {
  const res = await fetch(
    `https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&license=cc0,pdm&per_page=15&filter_dead=false`,
    { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) },
  );
  await sleep(3200);
  if (!res.ok) return [];
  const d = (await res.json()) as any;
  return (d?.results ?? []).filter((r: any) => (r.width ?? 0) >= 600);
}

async function download(url: string, dest: string): Promise<boolean> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(25000) });
    if (!res.ok) return false;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 15_000) return false;
    const img = sharp(buf, { failOn: 'none' }).rotate();
    const meta = await img.metadata();
    if ((meta.width ?? 0) < 500) return false;
    await img.resize({ width: 1100, height: 1100, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 84 }).toFile(dest);
    return true;
  } catch {
    return false;
  }
}

async function crops(src: string, dir: string): Promise<string[]> {
  const outs: string[] = [];
  try {
    const meta = await sharp(src, { failOn: 'none' }).metadata();
    const w = meta.width ?? 1000;
    const h = meta.height ?? 1000;
    await sharp(src, { failOn: 'none' })
      .extract({ left: Math.floor(w * 0.19), top: Math.floor(h * 0.12), width: Math.floor(w * 0.62), height: Math.floor(h * 0.62) })
      .jpeg({ quality: 84 }).toFile(path.join(dir, 'detail.jpg'));
    outs.push('detail.jpg');
    await sharp(src, { failOn: 'none' })
      .extract({ left: 0, top: Math.floor(h * 0.3), width: Math.floor(w * 0.7), height: Math.floor(h * 0.7) })
      .jpeg({ quality: 84 }).toFile(path.join(dir, 'angle.jpg'));
    outs.push('angle.jpg');
  } catch { /* best effort */ }
  return outs;
}

async function main() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const name = 'Argan Hair Serum';
  const queries = ['argan oil', 'oil bottle', 'serum bottle', 'hair care product'];
  const BAD = /stoneware|celadon|goryeo|vase|pottery|ceramic|antique|_box_|box,/i;

  for (const q of queries) {
    const results = await openverse(q);
    const ok = results.filter((r: any) => !BAD.test(String(r.title ?? '')));
    for (const r of ok.slice(0, 5)) {
      const dirName = 'argan-hair-serum';
      const dir = path.join(OUT_DIR, dirName);
      fs.rmSync(dir, { recursive: true, force: true });
      fs.mkdirSync(dir, { recursive: true });
      const url = r.url as string;
      console.log('trying:', String(r.title ?? '').slice(0, 60), '|', url.slice(0, 70));
      if (!(await download(url, path.join(dir, '1.jpg')))) continue;
      const images = [`/images/seed/products/${dirName}/1.jpg`];
      const credits = [{
        title: String(r.title ?? ''),
        creator: String(r.creator ?? 'Unknown').slice(0, 120),
        license: String(r.license ?? 'cc0').toUpperCase(),
        url: String(r.foreign_landing_url ?? ''),
      }];
      for (const f of await crops(path.join(dir, '1.jpg'), dir)) {
        images.push(`/images/seed/products/${dirName}/${f}`);
      }
      manifest[name] = { category: 'beauty-perfumes', type: 'PHYSICAL', images, credits, source: 'openverse-cc0+manual' };
      fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
      console.log('FIXED:', name, '→', String(r.title ?? '').slice(0, 60));
      return;
    }
  }
  console.log('STILL FAILED:', name);
}

main().catch((e) => { console.error(e); process.exit(1); });
