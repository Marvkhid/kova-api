// ============================================================
// KOVA — Real-photo pool fetcher (DEVELOPMENT ASSETS)
// Downloads CC0/public-domain photographs from the Openverse
// API (no key required) into kova/public/images/seed/photo/<cat>/
// so demo products carry REAL product photography instead of
// placeholder SVGs. First-party files only — nothing hotlinked.
// Deterministic: queries and page per category are fixed.
// Run: npx ts-node scripts/fetch-photo-pool.ts
// Requires network access to api.openverse.org.
// ============================================================

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';

const OUT_ROOT = path.resolve(__dirname, '../../kova/public/images/seed/photo');

/** Category slug → Openverse search queries (mixed for variety). */
const CATEGORY_QUERIES: Record<string, string[]> = {
  electronics: ['headphones product', 'smartphone product photo', 'laptop desk', 'computer keyboard', 'camera lens', 'smartwatch', 'game controller', 'bluetooth speaker'],
  fashion: ['african fashion', 'sneakers product', 'leather handbag', 'wrist watch product', 'sunglasses product', 'jewelry earrings', 'clothing rack', 'shoes product'],
  beauty: ['perfume bottle', 'cosmetics products', 'skincare cream jar', 'makeup brushes', 'lipstick', 'body lotion', 'nail polish', 'soap bar natural'],
  'interior-home': ['ceramic vase', 'home interior decor', 'throw pillow sofa', 'wall mirror frame', 'table lamp home', 'candle jar', 'picture frame wall', 'storage basket woven'],
  furniture: ['wooden chair', 'dining table wood', 'armchair interior', 'bookshelf books', 'bedroom furniture', 'desk workspace', 'office chair', 'sofa living room'],
  health: ['yoga mat', 'dumbbells gym', 'water bottle fitness', 'massage spa', 'essential oil bottle', 'fitness equipment', 'running shoes sport', 'herbal tea cup'],
  'digital-education': ['laptop study desk', 'online learning', 'notebook writing', 'typing keyboard hands', 'student studying', 'e-learning', 'books stack', 'workspace minimal'],
  'digital-products': ['website design screen', 'creative workspace', 'tablet design', 'digital art', 'camera flatlay', 'modern workspace', 'design tools', 'minimal desk setup'],
};

interface OvImage {
  id: string;
  url: string;
  license: string;
  width?: number | null;
  height?: number | null;
  filetype?: string | null;
}

function getJson(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': 'kova-demo-seed/1.0 (dev asset fetch)' } }, (res) => {
        if (res.statusCode && res.statusCode >= 300) {
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          res.resume();
          return;
        }
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
        });
      })
      .on('error', reject);
  });
}

function download(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'kova-demo-seed/1.0 (dev asset fetch)' } }, (res) => {
      // follow one redirect (flickr -> live.staticflickr)
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        download(res.headers.location, dest).then(resolve, reject);
        res.resume();
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        res.resume();
        return;
      }
      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve()));
      file.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(30_000, () => req.destroy(new Error('timeout')));
  });
}

async function main() {
  fs.mkdirSync(OUT_ROOT, { recursive: true });
  const manifestPath = path.join(OUT_ROOT, 'manifest.json');
  const manifest: Record<string, string[]> = {};
  let ok = 0;
  let fail = 0;

  for (const [cat, queries] of Object.entries(CATEGORY_QUERIES)) {
    const catDir = path.join(OUT_ROOT, cat);
    fs.mkdirSync(catDir, { recursive: true });
    const files: string[] = [];
    const seen = new Set<string>();

    for (let qi = 0; qi < queries.length; qi++) {
      const q = encodeURIComponent(queries[qi]);
      // CC0 + public domain marks only — no attribution burden, safe to ship
      const api = `https://api.openverse.org/v1/images/?q=${q}&license=cc0,pdm&per_page=12&filter_dead=false`;
      try {
        const data = await getJson(api);
        const results: OvImage[] = data.results ?? [];
        for (const img of results) {
          if (seen.has(img.id)) continue;
          seen.add(img.id);
          // prefer reasonably large, JPEG images
          const ext = (img.filetype === 'png' ? 'png' : 'jpg');
          const file = path.join(catDir, `${cat}-p${String(files.length + 1).padStart(2, '0')}.${ext}`);
          try {
            await download(img.url, file);
            // sanity: non-empty file
            if (fs.statSync(file).size < 8_000) {
              fs.unlinkSync(file);
              fail++;
              continue;
            }
            files.push(`/images/seed/photo/${cat}/${path.basename(file)}`);
            ok++;
          } catch {
            fail++;
          }
          if (files.length >= 40) break; // per-category pool cap
        }
      } catch (e) {
        console.error(`  query failed: ${queries[qi]} → ${(e as Error).message}`);
      }
      if (files.length >= 40) break;
    }
    manifest[cat] = files;
    console.log(`✓ ${cat}: ${files.length} photos`);
  }

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`\n✅ Pool complete — ${ok} photos downloaded, ${fail} failed/skipped.`);
  console.log(`   manifest → ${manifestPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
