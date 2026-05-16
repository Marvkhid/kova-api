// ============================================================
// KOVA API — Database Seed
// Run: npm run db:seed
// Seeds initial products so the frontend has real data.
// ============================================================

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding KOVA database...');

  // Create a demo seller user
  const seller = await prisma.user.upsert({
    where:  { email: 'demo-seller@kova.market' },
    update: {},
    create: {
      clerkId:  'demo_seller_001',
      email:    'demo-seller@kova.market',
      name:     'KOVA Demo Seller',
       role: 'SELLER',
    },
  });

  // Create seller profile
  await prisma.sellerProfile.upsert({
    where: { userId: seller.id },
    update: {},
    create: {
      userId:  seller.id,
      storeName: 'KOVA Store',
      storeSlug: 'kova-store',
      description: 'Official KOVA demo store',
      isVerified: true,
    },
  });

  // Seed products
  const products = [
    {
      name: 'Signature Washed Cap',
      description:  'A premium ring-spun cotton cap with a sun-faded wash finish and structured brim.',
      price: 12,
      category: 'FASHION' as const,
      badge: 'NEW' as const,
      tags: ['headwear', 'streetwear', 'unisex'],
      images: [],
      rating: 4.8,
      reviewCount: 124,
      buyCount: 340,
    },
    {
      name: 'UI Kit Pro Bundle',
      description:  'Over 600 Figma components, 40 templates, and a full design system.',
      price: 19,
      category: 'DIGITAL' as const,
      badge: 'HOT' as const,
      tags: ['figma', 'ui-kit', 'design'],
      images: [],
      rating: 4.9,
      reviewCount: 312,
      buyCount: 890,
    },
    {
      name: 'Podcast Editing Service',
      description:  'Full episode edit: noise removal, leveling, music transitions.',
      price: 15,
      originalPrice: 25,
      category: 'SERVICES' as const,
      badge: 'SALE' as const,
      tags: ['audio', 'podcast', 'editing'],
      images: [],
      rating: 4.7,
      reviewCount: 88,
      buyCount: 210,
    },
    {
      name: 'Hand-Poured Soy Candle Set',
      description: 'Three signature scents hand-poured in minimalist amber jars.',
      price: 18,
      category: 'PHYSICAL' as const,
      tags: ['home', 'wellness', 'gifts'],
      images: [],
      rating: 4.9,
      reviewCount: 201,
      buyCount: 560,
    },
    {
      name: 'Brand Identity Starter',
      description: 'Full brand identity kit: logo suite, color palette, typography.',
      price: 29,
      category: 'DIGITAL' as const,
      badge: 'HOT' as const,
      tags: ['branding', 'logo', 'identity'],
      images: [],
      rating: 4.8,
      reviewCount: 156,
      buyCount: 430,
    },
    {
      name: 'Minimal Linen Tote',
      description: 'Heavyweight 12oz linen tote with reinforced handles.',
      price: 14,
      category: 'FASHION' as const,
      tags: ['bags', 'sustainable', 'everyday'],
      images: [],
      rating: 4.6,
      reviewCount: 79,
      buyCount: 280,
    },
    {
      name: 'Motion Graphics Pack',
      description: '30 After Effects and CapCut templates for creators.',
      price: 24,
      category: 'DIGITAL' as const,
      tags: ['motion', 'video', 'templates'],
      images: [],
      rating: 4.7,
      reviewCount: 144,
      buyCount: 390,
    },
    {
      name: 'Artisan Leather Wallet',
      description: 'Slim bifold wallet hand-stitched from full-grain leather.',
      price: 22,
      category: 'PHYSICAL' as const,
      badge: 'NEW' as const,
      tags: ['leather', 'accessories', 'gifts'],
      images: [],
      rating: 4.9,
      reviewCount: 97,
      buyCount: 175,
    },
  ];

  for (const product of products) {
    const slug = product.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    await prisma.product.upsert({
      where: { slug },
      update: {},
      create: {
        ...product,
        slug,
        sellerId: seller.id,
      },
    });
  }

  console.log(`✅ Seeded ${products.length} products`);
  console.log('✅ Database seeded successfully!');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());