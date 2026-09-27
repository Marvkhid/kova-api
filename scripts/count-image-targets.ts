// Counts unique base products (image fetch targets) after the full
// expansion chain, mirroring prisma/seed.ts exactly.
import { expandCatalog } from '../prisma/catalog';
import { ITEMS } from '../prisma/seed-data';
import { LARGE_ITEMS } from '../prisma/catalog-large';
import { applyVariantExtensions } from '../prisma/catalog-variants';
import { applyWave3 } from '../prisma/catalog-wave3';
import { applyWave4 } from '../prisma/catalog-wave4';

const specs = expandCatalog(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  applyVariantExtensions(applyWave4(applyWave3([...ITEMS, ...LARGE_ITEMS] as any))),
);

const byName = new Map<string, { category: string; type: string; sellers: Set<string>; variants: number }>();
for (const s of specs) {
  // Base name = product name minus trailing variant decorations
  // (colour / "— Size X" / "— label"). Reconstruct from spec.item + slug.
  const base = s.item.name;
  const entry = byName.get(base);
  if (entry) {
    entry.variants++;
    entry.sellers.add(s.sellerSlug);
  } else {
    byName.set(base, { category: s.categorySlug, type: s.type, sellers: new Set([s.sellerSlug]), variants: 1 });
  }
}

const byCat = new Map<string, number>();
let digital = 0;
let physical = 0;
for (const [, e] of byName) {
  byCat.set(e.category, (byCat.get(e.category) ?? 0) + 1);
  if (e.type === 'DIGITAL') digital++;
  else physical++;
}

console.log('TOTAL SPECS (products):', specs.length);
console.log('UNIQUE BASE PRODUCTS (fetch targets):', byName.size);
console.log('  physical:', physical, '| digital:', digital);
console.log('  per category:');
for (const [c, n] of [...byCat.entries()].sort((a, b) => b[1] - a[1])) console.log('   ', c, n);

// Multi-seller base items (same item sold by several stores)
let multi = 0;
for (const [, e] of byName) if (e.sellers.size > 1) multi++;
console.log('base items sold by >1 seller:', multi);

// Dump the target list for the fetcher
const targets = [...byName.entries()].map(([name, e]) => ({
  name,
  category: e.category,
  type: e.type,
}));
require('fs').writeFileSync(
  require('path').resolve(__dirname, '../../kova/public/images/seed/photo-targets.json'),
  JSON.stringify(targets, null, 2),
);
console.log('wrote photo-targets.json with', targets.length, 'targets');
