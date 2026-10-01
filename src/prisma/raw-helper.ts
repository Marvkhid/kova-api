// Prisma 8 raw-SQL helpers.
//
// The raw lane (`db.raw.sql`) terminates in a plan (`RawRowQuery.build()`),
// which the runtime executes via `runtime.query(plan)` — an async iterable.
// The ORM collections gather rows themselves via `.all()`; the raw lane has
// no such terminal, so these helpers do the iterating. Rows are decoded with
// the codecs declared in `.returnsRow(...)`, exactly as `db.sql` would.
import { db } from './db';

/** Execute a raw row query and collect every row into an array. */
export async function rawRows<Row>(plan: { build(): unknown }): Promise<Row[]> {
  const runtime = db.runtime();
  const out: Row[] = [];
  for await (const row of runtime.query<Row>(plan.build() as never)) {
    out.push(row);
  }
  return out;
}

/** Execute a raw statement (UPDATE/DELETE/DDL) that returns no row data. */
export async function rawExec(
  stmt: { affectedCount(): { build(): unknown } },
): Promise<void> {
  const runtime = db.runtime();
  for await (const _ of runtime.query(stmt.affectedCount().build() as never)) {
    void _;
  }
}
