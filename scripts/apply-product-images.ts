// ============================================================
// KOVA — apply per-product images to the LIVE database
// Maps every Product row to its base SeedItem via the exact
// slug→baseName mapping from the expansion chain (the same
// specs seed.ts used to create the rows), looks up the verified
// image set in scripts/products-manifest.json, and updates ONLY
// the images column — ids, slugs, sellers, prices, statuses
// untouched. Run: npx ts-node scripts/apply-product-images.ts [--dry]
// ============================================================

import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const MANIFEST_PATH = path.resolve(__dirname, 'products-manifest.json');
const DRY = process.argv.includes('--dry');

// Mirrors the expansion chain in prisma/seed.ts so slug→base mapping
// is derived exactly the way the rows were created.
import { expandCatalog } from '../prisma/catalog';
import { ITEMS } from '../prisma/seed-data';
import { LARGE_ITEMS } from '../prisma/catalog-large';
import { applyVariantExtensions } from '../prisma/catalog-variants';
import { applyWave3 } from '../prisma/catalog-wave3';
import { applyWave4 } from '../prisma/catalog-wave4';

interface Credit { title: string; creator: string; license: string; url: string }
interface ManifestEntry { category: string; type: string; images: string[]; credits: Credit[]; source: string }

async function main() {
  const manifest: Record<string, ManifestEntry> = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  console.log('manifest entries:', Object.keys(manifest).length);

  const specs = expandCatalog(
    applyVariantExtensions(applyWave4(applyWave3([...ITEMS, ...LARGE_ITEMS]))),
  );
  console.log('expansion specs:', specs.length);

  // slug → base item name (specs carry both, exactly as seeded)
  const baseBySlug = new Map<string, string>();
  for (const s of specs) baseBySlug.set(s.slug, s.item.name);

  const rows = await prisma.product.findMany({
    select: { id: true, slug: true, images: true },
  });
  console.log('product rows:', rows.length);

  const updates: { id: string; slug: string; images: string[]; from: string }[] = [];
  let unmatched = 0;
  let alreadyOk = 0;
  let noManifest = 0;

  for (const row of rows) {
    const base = baseBySlug.get(row.slug);
    if (!base) { unmatched++; continue; }
    const entry = manifest[base];
    if (!entry?.images?.length) { noManifest++; continue; }
    if (JSON.stringify(row.images) === JSON.stringify(entry.images)) { alreadyOk++; continue; }
    updates.push({ id: row.id, slug: row.slug, images: entry.images, from: base });
  }

  console.log(`to update: ${updates.length} | already correct: ${alreadyOk} | no manifest entry: ${noManifest} | no slug match: ${unmatched}`);

  if (DRY) {
    for (const u of updates.slice(0, 8)) {
      console.log(`  DRY ${u.slug.slice(0, 48)} ← ${u.images.length} imgs from "${u.from.slice(0, 38)}"`);
    }
    return;
  }

  let n = 0;
  for (const u of updates) {
    await prisma.product.update({
      where: { id: u.id },
      data: { images: u.images },
    });
    n++;
    if (n % 200 === 0) console.log(`  updated ${n}/${updates.length}`);
  }
  console.log(`DONE — ${n} rows updated with product-verified images`);
}

main()
  .catch((e) => {
    console.error('FATAL', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
