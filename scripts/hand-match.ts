// Hand-matches the last stubborn targets with curated queries.
// Run: npx ts-node scripts/hand-match.ts
import * as fs from 'fs';
import * as path from 'path';

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-var-requires
const sharp = require('sharp') as any;

const ROOT = path.resolve(__dirname, '../..');
const KOVA_PUBLIC = path.join(ROOT, 'kova', 'public', 'images', 'seed');
const OUT_DIR = path.join(KOVA_PUBLIC, 'products');
const MANIFEST_PATH = path.join(__dirname, 'products-manifest.json');
const UA = 'kova-demo-seed/1.0 (demo marketplace product images)';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const HAND_PICKS: { name: string; category: string; type: string; queries: string[] }[] = [
  { name: 'Full-Stack Web Development Bootcamp', category: 'digital-education', type: 'DIGITAL', queries: ['web developer code screen', 'programming laptop code', 'software developer workspace'] },
  { name: 'Noise-Isolating Wired Earbuds', category: 'electronics', type: 'PHYSICAL', queries: ['wired earphones earbuds', 'in-ear headphones', 'earphones'] },
  { name: 'Portable Bluetooth Turntable', category: 'electronics', type: 'PHYSICAL', queries: ['portable turntable record player', 'vinyl record player', 'turntable vinyl'] },
  { name: 'Argan Hair Serum', category: 'beauty-perfumes', type: 'PHYSICAL', queries: ['argan oil bottle', 'hair oil bottle cosmetic', 'cosmetic serum bottle'] },
];

interface Cand { url: string; title: string; creator: string; license: string; pageUrl: string }

async function openverse(q: string): Promise<Cand[]> {
  const res = await fetch(
    `https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&license=cc0,pdm&per_page=12&filter_dead=false`,
    { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) },
  );
  await sleep(3200);
  if (!res.ok) return [];
  const d = (await res.json()) as any;
  return (d?.results ?? [])
    .filter((r: any) => (r.width ?? 0) >= 600)
    .map((r: any) => ({
      url: r.url,
      title: String(r.title ?? ''),
      creator: String(r.creator ?? 'Unknown').slice(0, 120),
      license: String(r.license ?? 'cc0').toUpperCase(),
      pageUrl: String(r.foreign_landing_url ?? ''),
    }));
}

async function commons(q: string): Promise<Cand[]> {
  const url =
    'https://commons.wikimedia.org/w/api.php?action=query&generator=search' +
    `&gsrsearch=${encodeURIComponent('filetype:bitmap ' + q)}&gsrlimit=12&gsrnamespace=6` +
    '&prop=imageinfo&iiprop=url|size|extmetadata&iiurlwidth=1200&format=json&origin=*';
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) });
  await sleep(1100);
  if (!res.ok) return [];
  const d = (await res.json()) as any;
  const out: Cand[] = [];
  for (const p of Object.values<any>(d?.query?.pages ?? {})) {
    const ii = p?.imageinfo?.[0];
    if (!ii || (ii.width ?? 0) < 600) continue;
    const em = ii.extmetadata ?? {};
    out.push({
      url: ii.thumburl || ii.url,
      title: String(p.title ?? ''),
      creator: String(em.Artist?.value ?? '').replace(/<[^>]+>/g, '').slice(0, 120) || 'Unknown',
      license: String(em.LicenseShortName?.value ?? 'see source'),
      pageUrl: String(ii.descriptionurl ?? ''),
    });
  }
  return out;
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

function score(title: string, toks: string[]): number {
  const t = new Set(title.toLowerCase().replace(/^file:/, '').replace(/\.[a-z]+$/i, '').split(/[^a-z0-9]+/));
  let hit = 0;
  for (const tok of toks) if (t.has(tok)) hit++;
  return hit / Math.max(1, toks.length);
}

async function main() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  for (const pick of HAND_PICKS) {
    if (manifest[pick.name]) { console.log('skip (already):', pick.name); continue; }
    let chosen: { c: Cand; q: string; src: string } | null = null;
    for (const q of pick.queries) {
      const qToks = q.split(' ');
      const cc = await commons(q);
      const bestCc = cc.sort((a, b) => score(b.title, qToks) - score(a.title, qToks))[0];
      if (bestCc && score(bestCc.title, qToks) >= 0.25) { chosen = { c: bestCc, q, src: 'wikimedia-commons' }; break; }
      const ov = await openverse(q);
      const bestOv = ov.sort((a, b) => score(b.title, qToks) - score(a.title, qToks))[0];
      if (bestOv && score(bestOv.title, qToks) >= 0.25) { chosen = { c: bestOv, q, src: 'openverse-cc0' }; break; }
    }
    if (!chosen) { console.log('STILL MISSED:', pick.name); continue; }

    const dirName = pick.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
    const dir = path.join(OUT_DIR, dirName);
    fs.mkdirSync(dir, { recursive: true });
    const images: string[] = [];
    const credits: { title: string; creator: string; license: string; url: string }[] = [];
    if (await download(chosen.c.url, path.join(dir, '1.jpg'))) {
      images.push(`/images/seed/products/${dirName}/1.jpg`);
      credits.push({ title: chosen.c.title, creator: chosen.c.creator, license: chosen.c.license, url: chosen.c.pageUrl });
      for (const f of await crops(path.join(dir, '1.jpg'), dir)) {
        images.push(`/images/seed/products/${dirName}/${f}`);
      }
    }
    if (!images.length) { console.log('download failed:', pick.name); continue; }
    manifest[pick.name] = { category: pick.category, type: pick.type, images: images.slice(0, 4), credits, source: chosen.src + '+manual' };
    console.log('MATCHED:', pick.name, '→', chosen.c.title.slice(0, 60), `(${chosen.src})`);
  }
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  console.log('total entries:', Object.keys(manifest).length);
}

main().catch((e) => { console.error(e); process.exit(1); });
