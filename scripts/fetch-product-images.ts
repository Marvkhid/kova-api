// ============================================================
// KOVA — per-product image fetcher (REAL product matching)
// For each unique base product (photo-targets.json), search
// Wikimedia Commons (keyless, generous limits) for photos OF
// THAT product; fall back to Openverse CC0; as a last resort
// derive extra views by cropping ONE verified image (never
// unrelated ones). Writes:
//   kova/public/images/seed/products/<dir>/1..4.jpg
//   kova-api/scripts/products-manifest.json  (base name → images + credits)
// Resume-safe: targets already in the manifest with files on
// disk are skipped.
// Run: npx ts-node scripts/fetch-product-images.ts [--limit=N]
// ============================================================

import * as fs from 'fs';
import * as path from 'path';
// sharp is CJS (module.exports = fn); interop-safe require keeps ts-node happy.
// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-var-requires
const sharp = require('sharp') as any;

const ROOT = path.resolve(__dirname, '../..');
const KOVA_PUBLIC = path.join(ROOT, 'kova', 'public', 'images', 'seed');
const OUT_DIR = path.join(KOVA_PUBLIC, 'products');
const MANIFEST_PATH = path.join(__dirname, 'products-manifest.json');
const TARGETS_PATH = path.join(KOVA_PUBLIC, 'photo-targets.json');

const UA = 'kova-demo-seed/1.0 (demo marketplace product images; contact: adeniyimarv@gmail.com)';
const VERBOSE = process.argv.includes('--verbose');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Target { name: string; category: string; type: string }
interface Credit { title: string; creator: string; license: string; url: string }
interface ManifestEntry { category: string; type: string; images: string[]; credits: Credit[]; source: string }

// ── text helpers ─────────────────────────────────────────────

const COLOUR_WORDS = new Set([
  'black', 'white', 'red', 'blue', 'green', 'yellow', 'orange', 'purple', 'pink',
  'brown', 'grey', 'gray', 'silver', 'gold', 'beige', 'cream', 'navy', 'teal',
  'charcoal', 'walnut', 'oak', 'matte', 'glossy', 'bronze', 'copper', 'rose',
  'ivory', 'sand', 'olive', 'burgundy', 'lavender', 'mint', 'coral', 'amber',
]);

function buildQuery(name: string): string {
  let q = name
    .replace(/[—–-]\s*Size\s*\S+/gi, ' ')
    .replace(/[—–-]\s*\d+\s*(ml|g|kg|cm|mm|inch|in|w|oz)\b/gi, ' ')
    .replace(/\(([^)]*)\)/g, ' ')
    .replace(/[—–]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const tokens = q.split(' ');
  // Drop trailing/leading pure colour words only if enough tokens remain
  const filtered = tokens.filter((t) => {
    const lower = t.toLowerCase().replace(/[^a-z]/g, '');
    return !(COLOUR_WORDS.has(lower) && tokens.length > 2);
  });
  q = (filtered.length >= 2 ? filtered : tokens).join(' ');
  return q.toLowerCase();
}

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/^file:/, '')
    .replace(/\.[a-z]+$/i, '')
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2 && !COLOUR_WORDS.has(t));
}

/** Titles that look like AI renders, diagrams, drawings or icons — never product photos. */
const TITLE_BLOCKLIST = /dall|midjourney|stable diffusion|ai generated|generat|3d render|rendering|diagram|drawing|sketch|schematic|clipart|clip art|\.svg|logo of|icon of|patent/i;

function titleScore(title: string, queryTokens: string[]): number {
  const t = new Set(tokenize(title));
  let hit = 0;
  for (const tok of queryTokens) if (t.has(tok)) hit++;
  return hit / Math.max(1, queryTokens.length);
}

/**
 * Query retry ladder — exact name first, then progressively simplified
 * (digits/model numbers dropped, then head nouns only).
 */
function queryLadder(name: string): string[] {
  const full = buildQuery(name);
  const toks = full.split(' ').filter(Boolean);
  const noDigits = toks.filter((t) => !/\d/.test(t));
  const ladder: string[] = [full];
  if (noDigits.length >= 2 && noDigits.join(' ') !== full) ladder.push(noDigits.join(' '));
  if (noDigits.length > 3) ladder.push(noDigits.slice(0, 3).join(' '));
  return ladder;
}

const RELAXED = process.argv.includes('--relaxed');

/** Words that make a name a "marketing" name — stripped in relaxed mode. */
const PROGRAM_WORDS = /\b(course|guide|program|masterclass|bootcamp|toolkit|bundle|pack|ebook|e-book|handbook|crash|fundamentals|beginners|advanced|complete|practical|blueprint)\b/gi;

/**
 * Relaxed ladder for products Commons does not index by full name:
 * keep the core product type (head nouns), drop qualifiers/acronyms,
 * and give digital products a topic-based cover query.
 */
function relaxedLadder(name: string, category: string): string[] {
  const full = buildQuery(name);
  const toks = full.split(' ').filter(Boolean);
  const meaningful = toks.filter((t) => !/\d/.test(t) && t.length > 1);
  const ladder: string[] = [];

  if (category.startsWith('digital')) {
    // Digital covers: the SUBJECT of the product, not the packaging.
    const topic = meaningful
      .filter((t) => !PROGRAM_WORDS.test(t))
      .map((t) => t.replace(/[^a-z-]/g, ''))
      .filter(Boolean);
    PROGRAM_WORDS.lastIndex = 0;
    if (topic.length >= 2) ladder.push(topic.slice(0, 4).join(' '));
    if (topic.length >= 1) ladder.push(topic.slice(0, 2).join(' '));
    ladder.push(category === 'digital-education' ? 'online learning laptop' : 'creative workspace desk');
    return ladder;
  }

  if (meaningful.length >= 2) ladder.push(meaningful.join(' '));
  // Last-two-tokens (head noun + nearest modifier)
  if (meaningful.length >= 3) ladder.push(meaningful.slice(-2).join(' '));
  // Head noun alone (singular-safe)
  if (meaningful.length >= 2) {
    const head = meaningful[meaningful.length - 1].replace(/s$/, '');
    if (head.length > 2) ladder.push(head);
  }
  return ladder.length ? ladder : [full];
}

// ── sources ──────────────────────────────────────────────────

interface Candidate { url: string; width: number; title: string; creator: string; license: string; pageUrl: string }

async function searchCommons(query: string, limit = 20): Promise<Candidate[]> {
  const url =
    'https://commons.wikimedia.org/w/api.php?action=query&generator=search' +
    `&gsrsearch=${encodeURIComponent('filetype:bitmap ' + query)}` +
    `&gsrlimit=${limit}&gsrnamespace=6&prop=imageinfo&iiprop=url|size|extmetadata` +
    '&iiurlwidth=1200&format=json&origin=*';
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`commons ${res.status}`);
  const data = (await res.json()) as any;
  const pages = data?.query?.pages ?? {};
  const out: Candidate[] = [];
  for (const p of Object.values<any>(pages)) {
    const ii = p?.imageinfo?.[0];
    if (!ii) continue;
    if ((ii.width ?? 0) < 600) continue; // quality floor
    if (TITLE_BLOCKLIST.test(String(p.title ?? ''))) continue;
    const em = ii.extmetadata ?? {};
    out.push({
      url: ii.thumburl || ii.url,
      width: ii.width,
      title: String(p.title ?? ''),
      creator: String(em.Artist?.value ?? '').replace(/<[^>]+>/g, '').slice(0, 120) || 'Unknown',
      license: String(em.LicenseShortName?.value ?? 'see source'),
      pageUrl: String(em.Artifact?.value ?? ii.descriptionurl ?? ''),
    });
  }
  return out;
}

let ovTodayCount = 0;
async function searchOpenverse(query: string): Promise<Candidate[]> {
  if (ovTodayCount >= 150) return []; // hard self-cap well under 200/day
  const url =
    `https://api.openverse.org/v1/images/?q=${encodeURIComponent(query)}` +
    '&license=cc0,pdm&per_page=12&filter_dead=false';
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) });
  await sleep(3200); // ≤20/min
  if (!res.ok) return [];
  ovTodayCount++;
  const data = (await res.json()) as any;
  const out: Candidate[] = [];
  for (const r of data?.results ?? []) {
    if ((r.width ?? 0) < 600) continue;
    out.push({
      url: r.url,
      width: r.width,
      title: String(r.title ?? ''),
      creator: String(r.creator ?? 'Unknown').slice(0, 120),
      license: String(r.license ?? 'cc0').toUpperCase(),
      pageUrl: String(r.foreign_landing_url ?? ''),
    });
  }
  return out;
}

// ── download + normalise ─────────────────────────────────────

async function download(url: string, dest: string): Promise<boolean> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(25000) });
    if (!res.ok) {
      if (VERBOSE) console.log(`    dl ${res.status} ${url.slice(0, 70)}`);
      return false;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 15_000) return false; // tiny = likely icon/banner junk
    const img = sharp(buf, { failOn: 'none' }).rotate();
    const meta = await img.metadata();
    if ((meta.width ?? 0) < 500) return false;
    await img
      .resize({ width: 1100, height: 1100, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 84 })
      .toFile(dest);
    return true;
  } catch (e) {
    if (VERBOSE) console.log(`    dl ERR ${(e as Error).message?.slice(0, 60)} ${url.slice(0, 60)}`);
    return false;
  }
}

async function makeCrops(src: string, dir: string): Promise<string[]> {
  const outs: string[] = [];
  try {
    const img = sharp(src, { failOn: 'none' });
    const meta = await img.metadata();
    const w = meta.width ?? 1000;
    const h = meta.height ?? 1000;
    // Detail close-up: center 62% zoom
    await sharp(src, { failOn: 'none' })
      .extract({
        left: Math.floor(w * 0.19),
        top: Math.floor(h * 0.12),
        width: Math.floor(w * 0.62),
        height: Math.floor(h * 0.62),
      })
      .jpeg({ quality: 84 })
      .toFile(path.join(dir, 'detail.jpg'));
    outs.push('detail.jpg');
    // Alternate framing: offset crop (lower-left region)
    await sharp(src, { failOn: 'none' })
      .extract({
        left: 0,
        top: Math.floor(h * 0.3),
        width: Math.floor(w * 0.7),
        height: Math.floor(h * 0.7),
      })
      .jpeg({ quality: 84 })
      .toFile(path.join(dir, 'angle.jpg'));
    outs.push('angle.jpg');
  } catch {
    /* crops are best-effort */
  }
  return outs;
}

// ── per-target pipeline ──────────────────────────────────────

function safeDir(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

async function processTarget(t: Target): Promise<ManifestEntry | null> {
  const ladder = RELAXED ? relaxedLadder(t.name, t.category) : queryLadder(t.name);
  let candidates: Candidate[] = [];
  let query = '';
  let qTokens: string[] = [];
  let source = 'wikimedia-commons';

  for (const q of ladder) {
    query = q;
    qTokens = tokenize(query);
    try {
      candidates = await searchCommons(query);
    } catch {
      await sleep(1500);
      try { candidates = await searchCommons(query); } catch { candidates = []; }
    }
    await sleep(900);
    if (candidates.length < 2) {
      const ov = await searchOpenverse(query).catch(() => []);
      if (ov.length >= candidates.length) { candidates = ov; source = 'openverse-cc0'; }
      else source = 'wikimedia-commons';
    }
    if (candidates.length > 0) {
      candidates.sort((a, b) => titleScore(b.title, qTokens) - titleScore(a.title, qTokens));
      if (titleScore(candidates[0].title, qTokens) >= 0.3) break; // good enough
    }
  }
  if (candidates.length === 0) return null;

  // Rank by title relevance to the query
  candidates.sort((a, b) => titleScore(b.title, qTokens) - titleScore(a.title, qTokens));
  const best = candidates[0];
  if (TITLE_BLOCKLIST.test(best.title)) {
    if (VERBOSE) console.log(`  [${t.name}] REJECTED blocklisted best ${best.title.slice(0, 50)}`);
    return null;
  }
  if (titleScore(best.title, qTokens) < 0.3) {
    if (VERBOSE) console.log(`  [${t.name}] REJECTED weak score ${titleScore(best.title, qTokens).toFixed(2)} q="${query}"`);
    return null; // refuse weak matches
  }

  const dir = path.join(OUT_DIR, safeDir(t.name));
  fs.mkdirSync(dir, { recursive: true });
  if (VERBOSE) console.log(`  [${t.name}] q="${query}" candidates=${candidates.length} best=${best.title.slice(0, 60)}`);

  // Group same-product series: titles sharing a 6+ token prefix family
  const baseStem = best.title.replace(/^File:/, '').replace(/\.[a-z0-9]+$/i, '').slice(0, 28).toLowerCase();
  const series = candidates.filter((c) =>
    c.title.toLowerCase().replace(/^file:/, '').replace(/\.[a-z0-9]+$/i, '').slice(0, 28).startsWith(baseStem.slice(0, 18)),
  );
  const picks = (series.length >= 3 ? series : candidates).slice(0, 4);

  const images: string[] = [];
  const credits: Credit[] = [];
  let n = 1;
  for (const c of picks) {
    const file = `${n}.jpg`;
    if (await download(c.url, path.join(dir, file))) {
      images.push(`/images/seed/products/${safeDir(t.name)}/${file}`);
      credits.push({ title: c.title, creator: c.creator, license: c.license, url: c.pageUrl });
      n++;
    }
    await sleep(350);
  }

  if (images.length === 0) return null;

  // Fewer than 3 real photos → crop the PRIMARY verified image into
  // extra views (same product, honest detail shots — no unrelated filler).
  if (images.length < 3) {
    const crops = await makeCrops(path.join(dir, '1.jpg'), dir);
    for (const c of crops) images.push(`/images/seed/products/${safeDir(t.name)}/${c}`);
  }

  return { category: t.category, type: t.type, images: images.slice(0, 4), credits, source };
}

// ── main ─────────────────────────────────────────────────────

async function main() {
  const limitArg = process.argv.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? Number(limitArg.split('=')[1]) : Infinity;

  const targets: Target[] = JSON.parse(fs.readFileSync(TARGETS_PATH, 'utf8'));
  const manifest: Record<string, ManifestEntry> = fs.existsSync(MANIFEST_PATH)
    ? JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'))
    : {};
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // Worker pool — modest concurrency keeps us polite to the APIs while
  // cutting wall-clock time. JS is single-threaded → manifest is race-free.
  const CONCURRENCY = 3;
  let cursor = 0;
  let processed = 0;
  let fetched = 0;
  const failed: string[] = [];

  async function worker(): Promise<void> {
    while (true) {
      const i = cursor++;
      if (i >= targets.length || fetched >= limit) return;
      const t = targets[i];
      const existing = manifest[t.name];
      if (
        existing &&
        existing.images.every((p) => fs.existsSync(path.join(KOVA_PUBLIC, p.replace('/images/seed/', ''))))
      ) {
        processed++;
        continue;
      }
      const entry = await processTarget(t).catch(() => null);
      if (entry) {
        manifest[t.name] = entry;
        fetched++;
      } else {
        failed.push(`${t.name} [${t.category}]`);
      }
      processed++;
      if (processed % 12 === 0) {
        fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
        console.log(`… ${processed}/${targets.length} processed (${fetched} matched, ${failed.length} missed)`);
      }
    }
  }

  await Promise.all([worker(), worker(), worker()]);

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  console.log('DONE');
  console.log(`targets: ${targets.length} | matched: ${Object.keys(manifest).length} | missed this run: ${failed.length}`);
  if (failed.length) {
    console.log('MISSED (will retry with simplified queries on next run):');
    for (const f of failed.slice(0, 40)) console.log('  -', f);
    fs.writeFileSync(path.join(__dirname, 'missed.txt'), failed.join('\n'));
  }
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
