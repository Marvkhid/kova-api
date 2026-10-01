// Temporary smoke test for the Prisma 8 client (deleted after migration).
// Exercises the documented v8 query API against the existing database.
import { db } from '../src/prisma/db';

async function main() {
  // findMany + select
  const users = await db.orm.public.User.select('id', 'email').limit(3).all();
  console.log('users:', users.length, users[0]?.email);

  // where + orderBy + limit
  const products = await db.orm.public.Product
    .where({ status: 'PUBLISHED' })
    .orderBy((p) => p.createdAt.desc())
    .limit(3)
    .all();
  console.log('published products:', products.map((p) => ({ name: p.name, price: p.price, status: p.status })));

  // first() on a unique lookup
  const amina = await db.orm.public.SellerProfile.where({ storeSlug: 'amina-art-craft' }).first();
  console.log('amina store:', amina?.storeName, '| verified:', amina?.isVerified, '| createdAt type:', (amina as any)?.createdAt?.constructor?.name);

  // relation include
  const withSeller = await db.orm.public.Product
    .where({ slug: 'amina-handwoven-basket-tote' })
    .include('seller')
    .include('category')
    .first();
  console.log('product seller:', (withSeller as any)?.seller?.name, '| category:', (withSeller as any)?.category?.name);

  // aggregate (count)
  const agg = await db.orm.public.Product
    .where({ status: 'PUBLISHED' })
    .aggregate((agg) => ({ total: agg.count(), views: agg.sum('viewCount') }));
  console.log('aggregate:', agg);

  // transaction
  const txResult = await db.transaction(async (tx) => {
    const count = await tx.orm.public.Category.aggregate((agg) => ({ total: agg.count() }));
    return count;
  });
  console.log('tx categories:', txResult);

  await db.close();
  console.log('SMOKE OK');
}

main().catch((e) => { console.error('SMOKE FAIL:', e?.message ?? e, e?.code ?? ''); process.exit(1); });
