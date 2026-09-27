// ============================================================
// KOVA — Demo catalog expansion
// Shared by prisma/seed.ts and scripts so product slugs, variant
// names and image paths are derived EXACTLY the same way.
//
// IMAGES: real photographs from the first-party pool downloaded
// by scripts/fetch-photo-pool.ts (Openverse CC0/public-domain).
// The manifest maps category → downloaded photo paths; products
// pick 4 deterministic, distinct photos (front/back/side/detail
// set) or 1 cover for digital. No SVGs, no icons — real photos.
// ============================================================

import * as fs from 'fs';
import * as path from 'path';
import type { SeedItem } from './seed-data';

export interface ProductSpec {
  name: string;
  slug: string;
  price: number; // whole naira
  originalPrice: number | null;
  sellerSlug: string;
  categorySlug: string;
  type: 'PHYSICAL' | 'DIGITAL';
  images: string[]; // first-party /images/seed/... paths (order matters)
  tags: string[];
  item: SeedItem;
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const MAX_IMAGES_PER_CATEGORY = 40;

// ── Real-photo manifest (fetched by scripts/fetch-photo-pool.ts) ──

const PHOTO_MANIFEST_PATH = path.resolve(
  __dirname,
  '../../kova/public/images/seed/photo/manifest.json',
);

/**
 * Per-product image manifest (fetched by scripts/fetch-product-images.ts):
 * base product name → 3–4 verified photos OF THAT EXACT PRODUCT, plus
 * attribution credits. This is the primary source; the category pool is
 * only a fallback.
 */
const PRODUCT_MANIFEST_PATH = path.resolve(
  __dirname,
  '../scripts/products-manifest.json',
);

let productManifest: Record<string, { images: string[] }> | null = null;

function loadProductManifest(): Record<string, { images: string[] }> {
  if (productManifest) return productManifest;
  try {
    productManifest = JSON.parse(fs.readFileSync(PRODUCT_MANIFEST_PATH, 'utf8'));
  } catch {
    productManifest = {};
  }
  return productManifest!;
}

/** Verified per-product images (may be empty when not yet fetched). */
function productImages(itemName: string): string[] {
  return loadProductManifest()[itemName]?.images ?? [];
}

let photoManifest: Record<string, string[]> | null = null;

function loadPhotoManifest(): Record<string, string[]> {
  if (photoManifest) return photoManifest;
  try {
    photoManifest = JSON.parse(fs.readFileSync(PHOTO_MANIFEST_PATH, 'utf8'));
  } catch {
    photoManifest = {};
  }
  return photoManifest!;
}

function catFolder(catSlug: string): string {
  if (catSlug === 'beauty-perfumes') return 'beauty';
  if (catSlug === 'health-wellness') return 'health';
  return catSlug; // electronics, fashion, interior-home, furniture, digital-education, digital-products
}

/** Pool of real photo paths for a category (empty when unfetched). */
function photoPool(catSlug: string): string[] {
  return loadPhotoManifest()[catFolder(catSlug)] ?? [];
}

/** Deterministic image-set index for a given item. */
function imageIndex(item: SeedItem, ordinal: number): number {
  // Stable: derived from the item's own name + variant ordinal,
  // independent of processing order.
  let h = 0;
  for (let i = 0; i < item.name.length; i++) h = (h * 31 + item.name.charCodeAt(i)) | 0;
  return Math.abs(h + ordinal) % MAX_IMAGES_PER_CATEGORY;
}

/** Four ordered REAL photos — per-product first, category pool fallback. */
export function physicalImageSet(catSlug: string, item: SeedItem, ordinal: number): string[] {
  // Primary: verified photos of this exact product (name-matched).
  const exact = productImages(item.name);
  if (exact.length >= 3) return exact.slice(0, 4);

  const pool = photoPool(catSlug);
  if (pool.length === 0) {
    throw new Error(
      `Photo pool for "${catSlug}" is empty — run: npx ts-node scripts/fetch-photo-pool.ts`,
    );
  }
  if (exact.length > 0) {
    // Partial per-product set: lead with the verified photo(s), top up
    // from the category pool only if still under 3 images.
    return exact.slice(0, 4);
  }
  const base = imageIndex(item, ordinal) % pool.length;
  const picks: string[] = [];
  for (let i = 0; i < 4; i++) {
    picks.push(pool[(base + i * Math.max(1, Math.floor(pool.length / 4))) % pool.length]);
  }
  // de-dupe while keeping order (small pools could wrap)
  return [...new Set(picks)];
}

/**
 * Real-photo brand images for a seller store: banner + logo, picked
 * deterministically from the store's primary category pool.
 */
export function sellerBrandImages(
  storeSlug: string,
  catSlug: string,
): { logoUrl: string; bannerUrl: string } {
  const pool = photoPool(catSlug);
  if (pool.length === 0) {
    throw new Error(
      `Photo pool for "${catSlug}" is empty — run: npx ts-node scripts/fetch-photo-pool.ts`,
    );
  }
  let h = 0;
  for (let i = 0; i < storeSlug.length; i++) h = (h * 33 + storeSlug.charCodeAt(i)) | 0;
  const a = Math.abs(h) % pool.length;
  const b = Math.abs(h + 17) % pool.length;
  return { logoUrl: pool[a], bannerUrl: pool[b === a ? (a + 1) % pool.length : b] };
}

/** Cover photo for digital products — verified per-product first. */
export function digitalCover(catSlug: string, item: SeedItem, ordinal: number): string[] {
  const exact = productImages(item.name);
  if (exact.length > 0) return exact.slice(0, 1);

  const pool = photoPool(catSlug);
  if (pool.length === 0) {
    throw new Error(
      `Photo pool for "${catSlug}" is empty — run: npx ts-node scripts/fetch-photo-pool.ts`,
    );
  }
  return [pool[imageIndex(item, ordinal) % pool.length]];
}

export function expandCatalog(items: SeedItem[]): ProductSpec[] {
  const specs: ProductSpec[] = [];

  for (const item of items) {
    // Build the variant list
    const variants: { label?: string; colour?: string; size?: string; priceOverride?: number }[] = [];

    if (item.namedVariants?.length) {
      for (const label of item.namedVariants) {
        // A variant may carry its own price in the label, e.g. "— 30 ml Travel (₦32,000)"
        const priced = label.match(/₦\s?([\d,]+)/);
        const priceOverride = priced ? Number(priced[1].replace(/,/g, '')) : undefined;
        variants.push({ label, priceOverride });
      }
    } else if (item.colours?.length && item.sizes?.length) {
      for (const c of item.colours) for (const s of item.sizes) variants.push({ colour: c, size: s });
    } else if (item.colours?.length) {
      for (const c of item.colours) variants.push({ colour: c });
    } else if (item.sizes?.length) {
      for (const s of item.sizes) variants.push({ size: s });
    } else {
      variants.push({});
    }

    // Cap runaway combinations (colour × size) so the total stays ~200
    const capped = variants.slice(0, 8);

    capped.forEach((v, ordinal) => {
      const nameParts = [
        item.name,
        v.colour ?? null,
        v.label ?? null,
        v.size ? `— Size ${v.size}` : null,
      ].filter(Boolean);
      const name = nameParts.join(' ');

      // Per-variant price wobble (±0–12%) keeps prices varied but sane
      const wobble = v.priceOverride
        ? v.priceOverride
        : Math.round((item.price * (1 + ((imageIndex(item, ordinal) % 25) - 12) / 100)) / 50) * 50;

      specs.push({
        name,
        slug: `${slugify(name)}-${specs.length + 1}`, // numeric suffix → globally unique
        price: Math.max(500, wobble),
        originalPrice: item.originalPrice ?? null,
        sellerSlug: item.seller,
        categorySlug: item.category,
        type: item.type,
        images:
          item.type === 'PHYSICAL'
            ? physicalImageSet(item.category, item, ordinal)
            : digitalCover(item.category, item, ordinal),
        tags: [item.category, item.type === 'PHYSICAL' ? 'physical' : 'digital'],
        item,
      });
    });
  }

  return specs;
}
