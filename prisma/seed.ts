// ============================================================
// KOVA — Development Seed (DEMO DATA ONLY)
// Run: npx prisma db seed   (or: npm run db:seed)
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
// BATCHES (createMany) — a remote pooled Postgres makes
// per-row round-trips unusably slow at 1,000+ products.
// ============================================================

import { PrismaClient, Prisma } from '@prisma/client';
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

const prisma = new PrismaClient();

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
  const demoUsers = await prisma.user.findMany({
    where: { clerkId: { in: DEMO_CLERK_IDS } },
    select: { id: true },
  });
  const demoIds = demoUsers.map((u) => u.id);
  if (demoIds.length) {
    console.log(`   clearing ${demoIds.length} demo users and related rows…`);
    // Order matters: children first. Products cascade to reviews/cart/wishlist.
    await prisma.orderEvent.deleteMany({ where: { order: { userId: { in: demoIds } } } });
    await prisma.orderItem.deleteMany({ where: { order: { userId: { in: demoIds } } } });
    await prisma.order.deleteMany({ where: { userId: { in: demoIds } } });
    await prisma.sellerReview.deleteMany({
      where: { OR: [{ sellerUserId: { in: demoIds } }, { authorId: { in: demoIds } }] },
    });
    await prisma.review.deleteMany({
      where: { OR: [{ userId: { in: demoIds } }, { product: { sellerId: { in: demoIds } } }] },
    });
    await prisma.wishlistItem.deleteMany({ where: { userId: { in: demoIds } } });
    await prisma.product.deleteMany({ where: { sellerId: { in: demoIds } } });
    await prisma.sellerProfile.deleteMany({ where: { userId: { in: demoIds } } });
    await prisma.user.deleteMany({ where: { id: { in: demoIds } } });
  }

  // 2. Categories (upsert — categories may already exist from earlier seeds)
  const categoryBySlug = new Map<string, string>();
  for (const c of CATEGORIES) {
    const row = await prisma.category.upsert({
      where: { slug: c.slug },
      create: { name: c.name, slug: c.slug, icon: c.icon, sortOrder: c.sortOrder, isActive: true },
      update: { name: c.name, icon: c.icon, sortOrder: c.sortOrder },
    });
    categoryBySlug.set(c.slug, row.id);
  }

  // 3. Demo admin
  await prisma.user.create({
    data: {
      clerkId: DEMO_ADMIN.clerkId,
      email: DEMO_ADMIN.email,
      name: DEMO_ADMIN.name,
      role: 'ADMIN',
    },
  });

  // 4. Sellers + profiles
  const sellerUserBySlug = new Map<string, string>();
  for (const s of SELLERS) {
    const user = await prisma.user.create({
      data: {
        clerkId: s.clerkId,
        email: s.email,
        name: s.name,
        avatarUrl: s.avatarUrl,
        role: 'SELLER',
        sellerProfile: {
          create: {
            storeName: s.storeName,
            storeSlug: s.storeSlug,
            description: s.description,
            location: s.location,
            logoUrl: s.logoUrl,
            bannerUrl: s.bannerUrl,
            isVerified: s.isVerified,
          },
        },
      },
    });
    sellerUserBySlug.set(s.storeSlug, user.id);
  }

  // 5. Buyers
  const buyerIds: string[] = [];
  for (const b of BUYERS) {
    const user = await prisma.user.create({
      data: { clerkId: b.clerkId, email: b.email, name: b.name, role: 'BUYER' },
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

  const productCreate: Prisma.ProductCreateManyInput[] = [];
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
      price: new Prisma.Decimal(spec.price),
      originalPrice: spec.originalPrice ? new Prisma.Decimal(spec.originalPrice) : null,
      productType: spec.type,
      status,
      badge: daysAgo <= 21 ? 'NEW' : chance(0.12) ? 'HOT' : spec.originalPrice ? 'SALE' : null,
      tags: spec.tags,
      images: spec.images,
      inStock: spec.type === 'DIGITAL' ? true : chance(0.93),
      sellerId: sellerUserBySlug.get(spec.sellerSlug)!,
      categoryId: categoryBySlug.get(spec.categorySlug)!,
      createdAt,
      updatedAt: createdAt,
      viewCount: intBetween(15, 1600),
    });
  }

  for (const batch of chunk(productCreate, 250)) {
    await prisma.product.createMany({ data: batch });
  }
  const published = productCreate.filter((p) => p.status === 'PUBLISHED').length;
  console.log(`   ${published} published · ${productCreate.length - published} left as drafts`);

  // Map slug → id for order/review wiring
  const idBySlug = new Map<string, string>();
  for (const batch of chunk(specs.map((s) => s.slug), 400)) {
    const rows = await prisma.product.findMany({
      where: { slug: { in: batch } },
      select: { id: true, slug: true, price: true, productType: true, sellerId: true, createdAt: true },
    });
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
  const orderRows: Prisma.OrderCreateManyInput[] = [];
  const itemRows: (Prisma.OrderItemCreateManyInput & { orderNumber: string })[] = [];
  const eventRows: (Prisma.OrderEventCreateManyInput & { orderNumber: string })[] = [];
  const reviewSpecs: { buyerId: string; slug: string; at: number }[] = [];

  orderSpecs.forEach((os, i) => {
    const prod = specs.find((s) => s.slug === os.slug)!;
    const orderNumber = `KV-${100000 + i}`;
    const createdAt = Date.now() - os.daysAgo * 86400000;
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
      subtotal: new Prisma.Decimal(subtotalKobo).div(100),
      shipping: new Prisma.Decimal(shipping),
      total: new Prisma.Decimal(totalKobo).div(100),
      // City-level demo address — no real private addresses.
      shippingAddress: {
        city: pick(NIGERIAN_CITIES), state: 'Demo State', country: 'Nigeria', level: 'city',
      } as Prisma.InputJsonValue,
      createdAt: new Date(createdAt),
      updatedAt: new Date(createdAt),
    });

    itemRows.push({
      orderNumber,
      orderId: '', // resolved after insert
      productId: idBySlug.get(os.slug)!,
      quantity: os.qty,
      price: new Prisma.Decimal(prod.price),
      fulfillmentStatus: os.track as Prisma.OrderItemCreateManyInput['fulfillmentStatus'],
      createdAt: new Date(createdAt),
      updatedAt: new Date(createdAt),
    });

    // Event timeline mirrors the orders module lifecycle
    const flow = TRACK_FLOW[os.track];
    const carrier = ['SHIPPED', 'IN_TRANSIT', 'DELIVERED'].includes(os.track) && chance(0.6)
      ? pick(carriers) : null;
    flow.forEach((status, ev) => {
      eventRows.push({
        orderNumber,
        orderId: '', // resolved after insert
        status: status as Prisma.OrderEventCreateManyInput['status'],
        message: status === 'SHIPPED' && carrier ? `Shipped — handed to ${carrier}` : TRACK_MESSAGE[status],
        createdAt: new Date(createdAt + Math.round(ev * between(4, 20) * 3600000)),
      });
    });

    if (paid && os.track === 'DELIVERED' && chance(0.8)) {
      reviewSpecs.push({ buyerId: os.buyerId, slug: os.slug, at: createdAt + intBetween(2, 14) * 86400000 });
    }
  });

  for (const batch of chunk(orderRows, 250)) {
    await prisma.order.createMany({ data: batch });
  }
  const orderIds = new Map<string, string>();
  for (const batch of chunk(orderRows.map((o) => o.orderNumber as string), 400)) {
    const rows = await prisma.order.findMany({
      where: { orderNumber: { in: batch } },
      select: { id: true, orderNumber: true },
    });
    for (const r of rows) orderIds.set(r.orderNumber, r.id);
  }
  for (const row of itemRows) row.orderId = orderIds.get(row.orderNumber)!;
  for (const row of eventRows) row.orderId = orderIds.get(row.orderNumber)!;

  for (const batch of chunk(itemRows, 400)) {
    await prisma.orderItem.createMany({
      data: batch.map(({ orderNumber: _o, ...rest }) => rest),
    });
  }
  for (const batch of chunk(eventRows, 500)) {
    await prisma.orderEvent.createMany({
      data: batch.map(({ orderNumber: _o, ...rest }) => rest),
    });
  }
  const orderCount = orderRows.length;
  console.log(`   ${orderCount} orders with full event timelines`);

  // 8. Reviews — verifiedPurchase=true is TRUE here because a real PAID
  //    order chain for the same (buyer, product) pair exists above.
  const seenProductReview = new Set<string>();
  const reviewRows: Prisma.ReviewCreateManyInput[] = [];
  const seenSellerReview = new Set<string>();
  const sellerReviewRows: Prisma.SellerReviewCreateManyInput[] = [];

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

    reviewRows.push({
      userId: rs.buyerId,
      productId: idBySlug.get(rs.slug)!,
      rating,
      title: pick(pool[0]),
      comment,
      verifiedPurchase: true, // backed by the real PAID order created above
      createdAt: new Date(Math.min(rs.at, Date.now() - 3600000)),
      updatedAt: new Date(Math.min(rs.at, Date.now() - 3600000)),
    });

    // Seller reputation rides along for most delivered purchases
    const sellerUserId = sellerUserBySlug.get(spec.sellerSlug)!;
    const sKey = `${sellerUserId}:${rs.buyerId}`;
    if (!seenSellerReview.has(sKey) && chance(0.6)) {
      seenSellerReview.add(sKey);
      const at = new Date(rs.at + 86400000);
      sellerReviewRows.push({
        sellerUserId,
        authorId: rs.buyerId,
        rating: Math.max(1, Math.min(5, rating + pick([0, 0, 1, -1] as const))),
        communication: 3 + intBetween(0, 2),
        productAccuracy: 3 + intBetween(0, 2),
        packaging: 3 + intBetween(0, 2),
        deliveryExperience: 3 + intBetween(0, 2),
        comment: chance(0.35) ? 'Good communication and quick dispatch.' : null,
        createdAt: at,
        updatedAt: at,
      });
    }
  }

  for (const batch of chunk(reviewRows, 300)) {
    await prisma.review.createMany({ data: batch });
  }
  for (const batch of chunk(sellerReviewRows, 300)) {
    await prisma.sellerReview.createMany({ data: batch });
  }
  const productReviewCount = reviewRows.length;

  // 9. Recompute aggregates FROM Review / OrderItem rows — the exact math
  //    the reviews module uses on every mutation, applied in one pass.
  await prisma.$executeRawUnsafe(`
    UPDATE products p SET
      rating = COALESCE(ROUND(r.avg_rating::numeric, 1), 0),
      "reviewCount" = COALESCE(r.cnt, 0)
    FROM (
      SELECT "productId", AVG(rating) AS avg_rating, COUNT(*) AS cnt
      FROM reviews WHERE status = 'VISIBLE' GROUP BY "productId"
    ) r
    WHERE r."productId" = p.id
  `);
  await prisma.$executeRawUnsafe(`
    UPDATE products SET rating = 0, "reviewCount" = 0
    WHERE id NOT IN (SELECT "productId" FROM reviews WHERE status = 'VISIBLE')
  `);
  // buyCount = paid order quantity, matching the production aggregate meaning
  await prisma.$executeRawUnsafe(`
    UPDATE products p SET "buyCount" = COALESCE(x.q, 0)
    FROM (
      SELECT oi."productId", SUM(oi.quantity) AS q
      FROM order_items oi JOIN orders o ON o.id = oi."orderId"
      WHERE o."paymentStatus" = 'PAID'
      GROUP BY oi."productId"
    ) x
    WHERE x."productId" = p.id
  `);
  await prisma.$executeRawUnsafe(`
    UPDATE products SET "buyCount" = 0
    WHERE id NOT IN (
      SELECT oi."productId" FROM order_items oi
      JOIN orders o ON o.id = oi."orderId" WHERE o."paymentStatus" = 'PAID'
    )
  `);

  // 10. Wishlist for a few buyers (exercises the wishlist path end-to-end)
  const wishlistRows: Prisma.WishlistItemCreateManyInput[] = [];
  for (const buyerId of buyerIds.slice(0, 6)) {
    const n = intBetween(1, 4);
    for (let i = 0; i < n; i++) {
      const target = pick(specs);
      wishlistRows.push({ userId: buyerId, productId: idBySlug.get(target.slug)! });
    }
  }
  await prisma.wishlistItem.createMany({ data: wishlistRows, skipDuplicates: true });

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
  const checks: [string, boolean, string][] = [];

  const total = await prisma.product.count();
  checks.push(['product count ≥ 1000 (5 sellers × 200+)', total >= 1000, `${total}`]);

  const noCategory = await prisma.product.count({ where: { categoryId: null } });
  checks.push(['every product has a category', noCategory === 0, `${noCategory} missing`]);

  const physical = await prisma.product.findMany({
    where: { productType: 'PHYSICAL', status: 'PUBLISHED' },
    select: { images: true },
  });
  checks.push(['published physical products have ≥3 images', physical.every((p) => p.images.length >= 3), '']);

  const digital = await prisma.product.findMany({
    where: { productType: 'DIGITAL', status: 'PUBLISHED' },
    select: { images: true },
  });
  checks.push(['published digital products have a cover', digital.every((p) => p.images.length >= 1), '']);

  const unverified = await prisma.review.count({ where: { verifiedPurchase: false } });
  checks.push(['every review traces to a real PAID order', unverified === 0, `${unverified} unverified`]);

  const orderEvents = await prisma.orderEvent.count();
  checks.push(['order timelines populated', expectedOrders > 0 && orderEvents >= expectedOrders, `${orderEvents} events`]);

  const zeroPrice = await prisma.product.count({ where: { price: { lte: 0 } } });
  checks.push(['no zero/negative prices', zeroPrice === 0, `${zeroPrice} bad`]);

  const aggMismatch = await prisma.product.count({
    where: { rating: 0, reviewCount: { gt: 0 } },
  });
  checks.push(['rating aggregates consistent with review rows', aggMismatch === 0, `${aggMismatch} mismatched`]);

  const draftCount = await prisma.product.count({ where: { status: 'DRAFT' } });
  checks.push(['a small share of drafts exists (realistic pipeline)', draftCount > 0 && draftCount < total * 0.1, `${draftCount} drafts`]);

  let failed = 0;
  console.log('   data-quality checks:');
  for (const [label, ok, detail] of checks) {
    if (!ok) failed++;
    console.log(`   ${ok ? '✓' : '✗'} ${label}${!ok && detail ? ` — ${detail}` : ''}`);
  }

  // Per-seller minimums (requirement: each seller ≥ 200 products)
  const bySeller = await prisma.product.groupBy({
    by: ['sellerId'],
    _count: { _all: true },
  });
  const sellers = await prisma.sellerProfile.findMany({
    select: { userId: true, storeName: true },
  });
  const nameOf = new Map(sellers.map((s) => [s.userId, s.storeName]));
  for (const row of bySeller) {
    const n = row._count._all;
    const ok = n >= 200;
    if (!ok) failed++;
    console.log(`   ${ok ? '✓' : '✗'} seller ${nameOf.get(row.sellerId) ?? row.sellerId} has ≥ 200 products${!ok ? ` — ${n}` : ''}`);
  }

  if (failed > 0) throw new Error(`${failed} data-quality check(s) failed`);
  void expectedReviews;
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
