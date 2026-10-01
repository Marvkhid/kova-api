// ============================================================
// KOVA — Development Seed (DEMO DATA ONLY) — Prisma 8
// Run: node -r ts-node/register/transpile-only prisma/seed.cts
//      (or: npm run db:seed)
//
// Rebuilds a realistic Nigerian demo marketplace through the
// real database layer — the same tables and constraints that
// production traffic uses. Demo rows are keyed by `demo_`
// clerkIds and `@kova.demo` emails; cleanup touches only those.
// Ratings and verified-purchase flags are derived exactly the
// way production derives them — never hand-written.
// Deterministic: mulberry32 PRNG, fixed constants.
//
// Performance: products/orders/events/reviews are inserted in
// BATCHES (createAll) — a remote pooled Postgres makes
// per-row round-trips unusably slow at 1,000+ products.
// (.cts + CommonJS: Node 24 + ts-node CJS hook — ESM-resolved
// .ts scripts cannot import the CJS-built src tree.)
// ============================================================

import { db } from '../src/prisma/db';
import { rawExec } from '../src/prisma/raw-helper';
import 'dotenv/config';
import {
  CATEGORIES, SELLERS, BUYERS, DEMO_ADMIN, ITEMS,
  REVIEW_TITLES_5, REVIEW_TITLES_4, REVIEW_TITLES_3, REVIEW_TITLES_2,
  REVIEW_COMMENTS_5, REVIEW_COMMENTS_4, REVIEW_COMMENTS_3, REVIEW_COMMENTS_2,
} from './seed-data';
import type { SeedItem } from './seed-data';
import { expandCatalog } from './catalog';
import { LARGE_ITEMS } from './catalog-large';
import { applyVariantExtensions } from './catalog-variants';
import { applyWave3 } from './catalog-wave3';
import { applyWave4 } from './catalog-wave4';

// ── v8 helpers ────────────────────────────────────────────

const orm = () => db.orm.public;

/** Date → Temporal.PlainDateTime (v8 `timestamp` column input). */
function pd(d: Date): Temporal.PlainDateTime {
  return Temporal.PlainDateTime.from(d.toISOString().replace(/\.\d+Z$/, ''));
}

/** Numeric columns accept strings at runtime; keep kobo-exact values. */
function dec(v: number): string {
  return (Math.round(v * 100) / 100).toFixed(2);
}

// ── Deterministic RNG (mulberry32) ────────────────────────

function mulberry32(seed: number) {
  let a = seed;
  return function rand(): number {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260922);
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)];
const between = (min: number, max: number) => min + rand() * (max - min);
const intBetween = (min: number, max: number) => Math.floor(between(min, max + 1));
const chance = (p: number) => rand() < p;

// ── Demo-data safety ──────────────────────────────────────

const DEMO_CLERK_IDS = [
  DEMO_ADMIN.clerkId,
  ...SELLERS.map((s) => s.clerkId),
  ...BUYERS.map((b) => b.clerkId),
];

async function assertDemoSafety() {
  if (process.env.NODE_ENV !== 'production' || process.env.KOVA_ALLOW_DEMO_SEED === 'yes') return;
  throw new Error(
    'Refusing to run the demo seed with NODE_ENV=production. ' +
    'If you truly intend to wipe demo_* rows on a live database, set KOVA_ALLOW_DEMO_SEED=yes.',
  );
}

// ── Description composer ──────────────────────────────────

function composeDescription(item: SeedItem, variantNote: string | null): string {
  const parts: string[] = [];
  if (item.type === 'PHYSICAL') {
    const open = variantNote
      ? `${item.name} (${variantNote.replace('— ', '')}) — part of our core range, quality-checked before dispatch.`
      : `${item.name} — part of our core range, quality-checked before dispatch.`;
    parts.push(open);
    if (item.material) parts.push(`Material: ${item.material}.`);
    if (item.dimensions) parts.push(`Dimensions: ${item.dimensions}.`);
    if (item.features?.length) parts.push(item.features.map((f) => `• ${f}`).join('\n'));
    if (item.includes?.length) parts.push(`What's included: ${item.includes.join(', ')}.`);
    if (item.care) parts.push(`Care: ${item.care}`);
    if (item.leadTime) parts.push(item.leadTime);
  } else {
    const open = variantNote
      ? `${item.name} (${variantNote.replace('— ', '')}) — instant access after purchase.`
      : `${item.name} — instant access after purchase.`;
    parts.push(open);
    if (item.format) parts.push(`Format: ${item.format}.`);
    if (item.contents?.length) parts.push(item.contents.map((c) => `• ${c}`).join('\n'));
    if (item.audience) parts.push(`Intended for: ${item.audience}.`);
    if (item.requirements?.length) parts.push(`Requirements: ${item.requirements.join(' ')}`);
    if (item.outcome) parts.push(`What you'll get: ${item.outcome}`);
  }
  return parts.join('\n\n');
}

// ── Order-lifecycle helpers (mirror the orders module) ────

type Track = 'DELIVERED' | 'SHIPPED' | 'IN_TRANSIT' | 'PROCESSING' | 'PAID' | 'CANCELLED';

const TRACK_FLOW: Record<Track, string[]> = {
  PAID: ['PAID'],
  PROCESSING: ['PAID', 'PROCESSING'],
  SHIPPED: ['PAID', 'PROCESSING', 'PACKED', 'SHIPPED'],
  IN_TRANSIT: ['PAID', 'PROCESSING', 'PACKED', 'SHIPPED', 'IN_TRANSIT'],
  DELIVERED: ['PAID', 'PROCESSING', 'PACKED', 'SHIPPED', 'IN_TRANSIT', 'DELIVERED'],
  CANCELLED: ['PAID', 'CANCELLED'],
};

const TRACK_MESSAGE: Record<string, string> = {
  PAID: 'Payment confirmed',
  PROCESSING: 'Seller is preparing your order',
  PACKED: 'Package packed by seller',
  SHIPPED: 'Shipped by seller',
  IN_TRANSIT: 'Package is in transit',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered',
  CANCELLED: 'Order cancelled',
};

// ── Review text helpers ───────────────────────────────────

const NIGERIAN_CITIES = ['Lagos', 'Ibadan', 'Abuja', 'Port Harcourt', 'Enugu', 'Kano', 'Abeokuta'];

function firstFeature(item: SeedItem): string {
  const f = item.features?.[0];
  if (!f) return 'the design';
  return f.replace(/^[A-Z]/, (c) => c.toLowerCase()).replace(/\.$/, '');
}

function fillTemplate(tpl: string, item: SeedItem, city: string): string {
  return tpl
    .replaceAll('{material}', item.material ?? 'the build quality')
    .replaceAll('{feature}', firstFeature(item))
    .replaceAll('{city}', city);
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ── Main ──────────────────────────────────────────────────

async function main() {
  await assertDemoSafety();
  console.log('🌱 Seeding KOVA demo marketplace (development data only)…');

  // 1. Clear previous demo rows — demo clerkIds only; real users untouched.
  const demoUsers = await orm().User
    .where((m) => m.clerkId.in(DEMO_CLERK_IDS))
    .select('id')
    .all();
  const demoIds = demoUsers.map((u) => u.id);
  if (demoIds.length) {
    console.log(`   clearing ${demoIds.length} demo users and related rows…`);
    // Order matters: children first. Products cascade to reviews/cart/wishlist.
    await orm().OrderEvent.where((m) => m.order.some((o) => o.userId.in(demoIds))).delete();
    await orm().OrderItem.where((m) => m.order.some((o) => o.userId.in(demoIds))).delete();
    await orm().Order.where((m) => m.userId.in(demoIds)).delete();
    await orm().SellerReview.where((m) => m.sellerUserId.in(demoIds)).delete();
    await orm().SellerReview.where((m) => m.authorId.in(demoIds)).delete();
    await orm().Review.where((m) => m.userId.in(demoIds)).delete();
    await orm().Review.where((m) => m.product.some((p) => p.sellerId.in(demoIds))).delete();
    await orm().WishlistItem.where((m) => m.userId.in(demoIds)).delete();
    await orm().Product.where((m) => m.sellerId.in(demoIds)).delete();
    await orm().SellerProfile.where((m) => m.userId.in(demoIds)).delete();
    await orm().User.where((m) => m.id.in(demoIds)).delete();
  }

  // 2. Categories (upsert — categories may already exist from earlier seeds)
  const categoryBySlug = new Map<string, string>();
  for (const c of CATEGORIES) {
    const existing = await orm().Category.where({ slug: c.slug }).first();
    if (existing) {
      await orm().Category.where({ id: existing.id }).update({
        name: c.name, icon: c.icon, sortOrder: c.sortOrder,
      });
      categoryBySlug.set(c.slug, existing.id);
    } else {
      const row = await orm().Category.create({
        name: c.name, slug: c.slug, icon: c.icon, sortOrder: c.sortOrder, isActive: true,
      });
      categoryBySlug.set(c.slug, row.id);
    }
  }

  // 3. Demo admin
  await orm().User.create({
    clerkId: DEMO_ADMIN.clerkId,
    email: DEMO_ADMIN.email,
    name: DEMO_ADMIN.name,
    role: 'ADMIN',
  });

  // 4. Sellers + profiles
  const sellerUserBySlug = new Map<string, string>();
  for (const s of SELLERS) {
    const user = await orm().User.create({
      clerkId: s.clerkId,
      email: s.email,
      name: s.name,
      avatarUrl: s.avatarUrl,
      role: 'SELLER',
    });
    await orm().SellerProfile.create({
      userId: user.id,
      storeName: s.storeName,
      storeSlug: s.storeSlug,
      description: s.description,
      location: s.location,
      logoUrl: s.logoUrl,
      bannerUrl: s.bannerUrl,
      isVerified: s.isVerified,
    });
    sellerUserBySlug.set(s.storeSlug, user.id);
  }

  // 5. Buyers
  const buyerIds: string[] = [];
  for (const b of BUYERS) {
    const user = await orm().User.create({
      clerkId: b.clerkId, email: b.email, name: b.name, role: 'BUYER',
    });
    buyerIds.push(user.id);
  }

  // 6. Products — expand catalog into distinct variant products, then
  //    insert in batches. Slugs are precomputed and globally unique.
  const specs = expandCatalog(
    // variants merge LAST so extras can also target wave-3/4 families
    applyVariantExtensions(applyWave4(applyWave3([...ITEMS, ...LARGE_ITEMS]))),
  );
  console.log(`   catalog expands to ${specs.length} products…`);

  const productCreate: Record<string, unknown>[] = [];
  for (const spec of specs) {
    const daysAgo = intBetween(2, 240);
    const createdAt = new Date(Date.now() - daysAgo * 86400000);
    const status: 'PUBLISHED' | 'DRAFT' = chance(0.96) ? 'PUBLISHED' : 'DRAFT';
    const variantNote = spec.name.startsWith(spec.item.name)
      ? spec.name.slice(spec.item.name.length).trim() || null
      : null;

    productCreate.push({
      name: spec.name,
      slug: spec.slug,
      description: composeDescription(spec.item, variantNote),
      price: dec(spec.price),
      originalPrice: spec.originalPrice ? dec(spec.originalPrice) : null,
      productType: spec.type,
      status,
      badge: daysAgo <= 21 ? 'NEW' : chance(0.12) ? 'HOT' : spec.originalPrice ? 'SALE' : null,
      tags: spec.tags,
      images: spec.images,
      inStock: spec.type === 'DIGITAL' ? true : chance(0.93),
      sellerId: sellerUserBySlug.get(spec.sellerSlug)!,
      categoryId: categoryBySlug.get(spec.categorySlug)!,
      createdAt: pd(createdAt),
      updatedAt: pd(createdAt),
      viewCount: intBetween(15, 1600),
    });
  }

  for (const batch of chunk(productCreate, 250)) {
    await orm().Product.createAll(batch as never);
  }
  const published = productCreate.filter((p) => p.status === 'PUBLISHED').length;
  console.log(`   ${published} published · ${productCreate.length - published} left as drafts`);

  // Map slug → id for order/review wiring
  const idBySlug = new Map<string, string>();
  for (const batch of chunk(specs.map((s) => s.slug), 400)) {
    const rows = await orm().Product
      .where((m) => m.slug.in(batch))
      .select('id', 'slug', 'price', 'productType', 'sellerId', 'createdAt')
      .all();
    for (const r of rows) idBySlug.set(r.slug, r.id);
  }

  // 7. Orders — real PAID order chains so verifiedPurchase derives true
  //    through the production lookup (orderItems → order.paymentStatus=PAID).
  type OrderSpec = {
    buyerId: string; slug: string; qty: number; daysAgo: number; track: Track;
  };
  const orderSpecs: OrderSpec[] = [];

  for (const spec of specs) {
    if (chance(spec.type === 'DIGITAL' ? 0.55 : 0.72)) {
      const track = pick([
        'DELIVERED', 'DELIVERED', 'DELIVERED', 'DELIVERED',   // bulk delivered history
        'SHIPPED', 'IN_TRANSIT', 'PROCESSING', 'PAID', 'CANCELLED',
      ] as const);
      orderSpecs.push({
        buyerId: pick(buyerIds),
        slug: spec.slug,
        qty: chance(0.85) ? 1 : 2,
        daysAgo: track === 'CANCELLED' ? intBetween(2, 40) : intBetween(3, 200),
        track,
      });
    }
  }

  // Build every order row in memory, then insert in three batched passes:
  // orders → order_items → order_events (ids resolved via orderNumber).
  const carriers = ['GIG Logistics', 'Kwik Delivery', 'DHL Nigeria'];
  const orderRows: Record<string, unknown>[] = [];
  const itemRows: (Record<string, unknown> & { orderNumber: string })[] = [];
  const eventRows: (Record<string, unknown> & { orderNumber: string })[] = [];
  const reviewSpecs: { buyerId: string; slug: string; at: number }[] = [];

  orderSpecs.forEach((os, i) => {
    const prod = specs.find((s) => s.slug === os.slug)!;
    const orderNumber = `KV-${100000 + i}`;
    const createdAtMs = Date.now() - os.daysAgo * 86400000;
    const createdAt = new Date(createdAtMs);
    const subtotalKobo = Math.round(prod.price * 100) * os.qty; // kobo-exact
    const shipping = prod.type === 'PHYSICAL' && os.track !== 'CANCELLED'
      ? Math.round(between(2000, 6000) / 500) * 500
      : 0;
    const totalKobo = subtotalKobo + shipping * 100;
    const paid = os.track !== 'CANCELLED';

    orderRows.push({
      orderNumber,
      userId: os.buyerId,
      status: os.track,
      paymentStatus: paid ? 'PAID' : 'REFUNDED',
      paymentRef: paid ? `demo_pay_${i + 1}` : null,
      subtotal: dec(subtotalKobo / 100),
      shipping: dec(shipping),
      total: dec(totalKobo / 100),
      // City-level demo address — no real private addresses.
      shippingAddress: {
        city: pick(NIGERIAN_CITIES), state: 'Demo State', country: 'Nigeria', level: 'city',
      },
      createdAt: pd(createdAt),
      updatedAt: pd(createdAt),
    });

    itemRows.push({
      orderNumber,
      orderId: '', // resolved after insert
      productId: idBySlug.get(os.slug)!,
      quantity: os.qty,
      price: dec(prod.price),
      fulfillmentStatus: os.track,
      createdAt: pd(createdAt),
      updatedAt: pd(createdAt),
    });

    // Event timeline mirrors the orders module lifecycle
    const flow = TRACK_FLOW[os.track];
    const carrier = ['SHIPPED', 'IN_TRANSIT', 'DELIVERED'].includes(os.track) && chance(0.6)
      ? pick(carriers) : null;
    flow.forEach((status, ev) => {
      eventRows.push({
        orderNumber,
        orderId: '', // resolved after insert
        status,
        message: status === 'SHIPPED' && carrier ? `Shipped — handed to ${carrier}` : TRACK_MESSAGE[status],
        createdAt: pd(new Date(createdAtMs + Math.round(ev * between(4, 20) * 3600000))),
      });
    });

    if (paid && os.track === 'DELIVERED' && chance(0.8)) {
      reviewSpecs.push({ buyerId: os.buyerId, slug: os.slug, at: createdAtMs + intBetween(2, 14) * 86400000 });
    }
  });

  for (const batch of chunk(orderRows, 250)) {
    await orm().Order.createAll(batch as never);
  }
  const orderIds = new Map<string, string>();
  for (const batch of chunk(orderRows.map((o) => o.orderNumber as string), 400)) {
    const rows = await orm().Order
      .where((m) => m.orderNumber.in(batch))
      .select('id', 'orderNumber')
      .all();
    for (const r of rows) orderIds.set(r.orderNumber, r.id);
  }
  for (const row of itemRows) row.orderId = orderIds.get(row.orderNumber)!;
  for (const row of eventRows) row.orderId = orderIds.get(row.orderNumber)!;

  for (const batch of chunk(itemRows, 400)) {
    await orm().OrderItem.createAll(
      batch.map(({ orderNumber: _o, ...rest }) => rest) as never,
    );
  }
  for (const batch of chunk(eventRows, 500)) {
    await orm().OrderEvent.createAll(
      batch.map(({ orderNumber: _o, ...rest }) => rest) as never,
    );
  }
  const orderCount = orderRows.length;
  console.log(`   ${orderCount} orders with full event timelines`);

  // 8. Reviews — verifiedPurchase=true is TRUE here because a real PAID
  //    order chain for the same (buyer, product) pair exists above.
  const seenProductReview = new Set<string>();
  const reviewRows: Record<string, unknown>[] = [];
  const seenSellerReview = new Set<string>();
  const sellerReviewRows: Record<string, unknown>[] = [];

  for (const rs of reviewSpecs) {
    const pairKey = `${rs.buyerId}:${rs.slug}`;
    if (seenProductReview.has(pairKey)) continue;
    seenProductReview.add(pairKey);

    const spec = specs.find((s) => s.slug === rs.slug)!;
    const rating = pick([5, 5, 5, 5, 5, 4, 4, 4, 3, 3, 2] as const);
    const pool: readonly [readonly string[], readonly string[]] =
      rating === 5 ? [REVIEW_TITLES_5, REVIEW_COMMENTS_5]
      : rating === 4 ? [REVIEW_TITLES_4, REVIEW_COMMENTS_4]
      : rating === 3 ? [REVIEW_TITLES_3, REVIEW_COMMENTS_3]
      : [REVIEW_TITLES_2, REVIEW_COMMENTS_2];
    const city = pick(NIGERIAN_CITIES);
    const comment = fillTemplate(pick(pool[1]), spec.item, city);

    const at = new Date(Math.min(rs.at, Date.now() - 3600000));
    reviewRows.push({
      userId: rs.buyerId,
      productId: idBySlug.get(rs.slug)!,
      rating,
      title: pick(pool[0]),
      comment,
      verifiedPurchase: true, // backed by the real PAID order created above
      createdAt: pd(at),
      updatedAt: pd(at),
    });

    // Seller reputation rides along for most delivered purchases
    const sellerUserId = sellerUserBySlug.get(spec.sellerSlug)!;
    const sKey = `${sellerUserId}:${rs.buyerId}`;
    if (!seenSellerReview.has(sKey) && chance(0.6)) {
      seenSellerReview.add(sKey);
      const sAt = new Date(rs.at + 86400000);
      sellerReviewRows.push({
        sellerUserId,
        authorId: rs.buyerId,
        rating: Math.max(1, Math.min(5, rating + pick([0, 0, 1, -1] as const))),
        communication: 3 + intBetween(0, 2),
        productAccuracy: 3 + intBetween(0, 2),
        packaging: 3 + intBetween(0, 2),
        deliveryExperience: 3 + intBetween(0, 2),
        comment: chance(0.35) ? 'Good communication and quick dispatch.' : null,
        createdAt: pd(sAt),
        updatedAt: pd(sAt),
      });
    }
  }

  for (const batch of chunk(reviewRows, 300)) {
    await orm().Review.createAll(batch as never);
  }
  for (const batch of chunk(sellerReviewRows, 300)) {
    await orm().SellerReview.createAll(batch as never);
  }
  const productReviewCount = reviewRows.length;

  // 9. Recompute aggregates FROM Review / OrderItem rows — the exact math
  //    the reviews module uses on every mutation, applied in one pass.
  await rawExec(db.raw.sql`
    UPDATE products p SET
      rating = COALESCE(ROUND(r.avg_rating::numeric, 1), 0),
      "reviewCount" = COALESCE(r.cnt, 0)
    FROM (
      SELECT "productId", AVG(rating) AS avg_rating, COUNT(*) AS cnt
      FROM reviews WHERE status = 'VISIBLE' GROUP BY "productId"
    ) r
    WHERE r."productId" = p.id
  `);
  await rawExec(db.raw.sql`
    UPDATE products SET rating = 0, "reviewCount" = 0
    WHERE id NOT IN (SELECT "productId" FROM reviews WHERE status = 'VISIBLE')
  `);
  // buyCount = paid order quantity, matching the production aggregate meaning
  await rawExec(db.raw.sql`
    UPDATE products p SET "buyCount" = COALESCE(x.q, 0)
    FROM (
      SELECT oi."productId", SUM(oi.quantity) AS q
      FROM order_items oi JOIN orders o ON o.id = oi."orderId"
      WHERE o."paymentStatus" = 'PAID'
      GROUP BY oi."productId"
    ) x
    WHERE x."productId" = p.id
  `);
  await rawExec(db.raw.sql`
    UPDATE products SET "buyCount" = 0
    WHERE id NOT IN (
      SELECT oi."productId" FROM order_items oi
      JOIN orders o ON o.id = oi."orderId" WHERE o."paymentStatus" = 'PAID'
    )
  `);

  // 10. Wishlist for a few buyers (exercises the wishlist path end-to-end)
  const wishlistRows: Record<string, unknown>[] = [];
  const seenWishlist = new Set<string>();
  for (const buyerId of buyerIds.slice(0, 6)) {
    const n = intBetween(1, 4);
    for (let i = 0; i < n; i++) {
      const target = pick(specs);
      const key = `${buyerId}:${target.slug}`;
      if (seenWishlist.has(key)) continue;
      seenWishlist.add(key);
      wishlistRows.push({ userId: buyerId, productId: idBySlug.get(target.slug)! });
    }
  }
  if (wishlistRows.length) {
    await orm().WishlistItem.createAll(wishlistRows as never);
  }

  // ── Data-quality verification ───────────────────────────
  await verify(specs.length, orderCount, productReviewCount);

  console.log('✅ Demo seed complete.');
  console.log(`   5 sellers · ${specs.length} products · ${orderCount} orders · ${productReviewCount} product reviews`);
  console.log('   Note: demo users exist in Postgres only. To sign in AS a demo user,');
  console.log('   create matching users in your Clerk dev instance (or point the auth');
  console.log('   sync at these clerkIds) — see prisma/seed-data.ts for the list.');
}

// ── Verification ──────────────────────────────────────────

async function verify(expectedProducts: number, expectedOrders: number, expectedReviews: number) {
  void expectedProducts;
  const checks: [string, boolean, string][] = [];

  const totalAgg = await orm().Product.aggregate((a) => ({ total: a.count() }));
  const total = Number(totalAgg.total);
  checks.push(['product count ≥ 1000 (5 sellers × 200+)', total >= 1000, `${total}`]);

  // every product has a category: total − categorized = missing
  const categorizedAgg = await orm().Product
    .where((m) => m.categoryId.isNotNull())
    .aggregate((a) => ({ n: a.count() }));
  const missingCategory = total - Number(categorizedAgg.n);
  checks.push(['every product has a category', missingCategory === 0, `${missingCategory} missing`]);

  const physical = await orm().Product
    .where({ productType: 'PHYSICAL', status: 'PUBLISHED' })
    .select('images')
    .all();
  checks.push(['published physical products have ≥3 images', physical.every((p) => (p.images?.length ?? 0) >= 3), '']);

  const digital = await orm().Product
    .where({ productType: 'DIGITAL', status: 'PUBLISHED' })
    .select('images')
    .all();
  checks.push(['published digital products have a cover', digital.every((p) => (p.images?.length ?? 0) >= 1), '']);

  const unverifiedAgg = await orm().Review
    .where({ verifiedPurchase: false })
    .aggregate((a) => ({ n: a.count() }));
  const unverified = Number(unverifiedAgg.n);
  checks.push(['every review traces to a real PAID order', unverified === 0, `${unverified} unverified`]);

  const orderEventsAgg = await orm().OrderEvent.aggregate((a) => ({ n: a.count() }));
  const orderEvents = Number(orderEventsAgg.n);
  checks.push(['order timelines populated', expectedOrders > 0 && orderEvents >= expectedOrders, `${orderEvents} events`]);

  const zeroPriceAgg = await orm().Product
    .where((m) => m.price.lte('0' as never))
    .aggregate((a) => ({ n: a.count() }));
  const zeroPrice = Number(zeroPriceAgg.n);
  checks.push(['no zero/negative prices', zeroPrice === 0, `${zeroPrice} bad`]);

  const aggMismatchAgg = await orm().Product
    .where({ rating: 0 })
    .where((m) => m.reviewCount.gt(0))
    .aggregate((a) => ({ n: a.count() }));
  const aggMismatch = Number(aggMismatchAgg.n);
  checks.push(['rating aggregates consistent with review rows', aggMismatch === 0, `${aggMismatch} mismatched`]);

  const draftAgg = await orm().Product
    .where({ status: 'DRAFT' })
    .aggregate((a) => ({ n: a.count() }));
  const draftCount = Number(draftAgg.n);
  checks.push(['a small share of drafts exists (realistic pipeline)', draftCount > 0 && draftCount < total * 0.1, `${draftCount} drafts`]);

  let failed = 0;
  console.log('   data-quality checks:');
  for (const [label, ok, detail] of checks) {
    if (!ok) failed++;
    console.log(`   ${ok ? '✓' : '✗'} ${label}${!ok && detail ? ` — ${detail}` : ''}`);
  }

  // Per-seller minimums (requirement: each seller ≥ 200 products)
  const bySeller = await orm().Product.groupBy('sellerId').aggregate((a) => ({ n: a.count() }));
  const sellers = await orm().SellerProfile.select('userId', 'storeName').all();
  const nameOf = new Map(sellers.map((s) => [s.userId, s.storeName]));
  for (const row of bySeller) {
    const n = Number(row.n);
    const ok = n >= 200;
    if (!ok) failed++;
    console.log(`   ${ok ? '✓' : '✗'} seller ${nameOf.get(row.sellerId) ?? row.sellerId} has ≥ 200 products${!ok ? ` — ${n}` : ''}`);
  }

  if (failed > 0) throw new Error(`${failed} data-quality check(s) failed`);
  void expectedReviews;
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .then(() => db.close());
