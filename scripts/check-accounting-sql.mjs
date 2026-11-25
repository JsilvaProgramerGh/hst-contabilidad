import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const fixture = createRequire(resolve(process.env.HST_SQL_CHECK_DIR ?? "../hst-sql-check", "package.json"));
const { PGlite } = fixture("@electric-sql/pglite");
const db = new PGlite();
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create table facturas (id bigint primary key, cliente text, numero text, monto numeric not null,
      estado text, iva numeric, fecha timestamptz, created_at timestamptz, pdf_url text);
    create table pagos_factura (id bigint primary key, factura_id bigint references facturas, monto numeric, fecha timestamptz, nota text);
    create table transactions (id uuid primary key, type text, amount numeric, created_at timestamptz, description text);
    create table share_links (id bigint primary key, token text);
    grant all on facturas,pagos_factura,transactions,share_links to anon,authenticated;
    create schema storage;
    create table storage.objects (bucket_id text, name text);
    alter table storage.objects enable row level security;
    grant usage on schema storage to anon;
    grant select on storage.objects to anon;
    create policy fixture_storage on storage.objects for select to anon using (true);
    insert into storage.objects values ('invoices','accounting/private.pdf'),('invoices','pos/existing.pdf');
    insert into facturas values (19,'Cliente sintético','AN-19',100,'parcial',null,'2026-11-05T05:00:00Z',now(),null);
    insert into pagos_factura values(78,19,25,'2026-11-06T05:00:00Z',null);
  `);
  const migration = await readFile(new URL("../docs/accounting-periods.sql", import.meta.url), "utf8");
  await db.exec(migration);
  await db.exec(migration);
  const execute = (id, data) => db.query("select public.hst_account_write($1,$2::jsonb)", [id, JSON.stringify(data)]);
  const sale = randomUUID(), purchase = randomUUID();
  const invoice = { action: "sale", number: "PR-1", customer: "Cliente sintético", issued: "2026-11-24", due: "2026-12-01",
    gross: "115", pdf_path: "accounting/fixture.pdf", vat: "15", discount: "0", lines: [{ product: "Vaso de prueba", qty: "2" }] };
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`set role ${role}`);
    await assert.rejects(execute(sale, invoice), /permission denied/);
    await assert.rejects(db.query("select * from facturas"), /permission denied/);
    await assert.rejects(db.query("select * from account_shares"), /permission denied/);
    if (role === "anon") assert.deepEqual((await db.query("select name from storage.objects")).rows, [{ name: "pos/existing.pdf" }]);
    await db.exec("reset role");
  }
  await db.exec("set role service_role");
  await execute(sale, invoice);
  await execute(sale, invoice);
  await assert.rejects(execute(sale, { ...invoice, gross: "120" }), /otros datos/);
  await assert.rejects(execute(randomUUID(), invoice), /duplicate key/);
  assert.equal((await db.query("select pdf_path from account_sales")).rows[0].pdf_path, invoice.pdf_path);
  const paymentId = randomUUID();
  const payment = { action: "payment", sale_id: sale, amount: "60", paid_on: "2026-11-24" };
  await Promise.all([execute(paymentId, payment), execute(paymentId, payment)]);
  const over = await Promise.allSettled([execute(randomUUID(), payment), execute(randomUUID(), payment)]);
  assert.ok(over.every((result) => result.status === "rejected"));
  await execute(randomUUID(), { ...payment, amount: "55" });
  await execute(randomUUID(), { action: "payment", legacy_id: "19", amount: "75", paid_on: "2026-11-24" });
  await assert.rejects(execute(randomUUID(), { action: "payment", legacy_id: "19", amount: "1", paid_on: "2026-11-24" }), /supera/);
  await execute(randomUUID(), { action: "legacy_details", legacy_id: "19", due: "2026-11-24", lines: invoice.lines });
  await execute(purchase, { action: "purchase", kind: "producto", supplier: "Proveedor sintético", reference: "PC-1", line_reference: "1",
    description: "Vaso de prueba", issued: "2026-11-24", qty: "4", gross: "80", vat: "12", eligible: "50" });
  await execute(randomUUID(), { action: "allocate", sale_id: sale, purchase_id: purchase, line: 1, qty: "2" });
  await assert.rejects(execute(randomUUID(), { action: "allocate", sale_id: sale, purchase_id: purchase, line: 1, qty: "1" }), /línea de venta/);
  const sale2 = randomUUID();
  await execute(sale2, { ...invoice, number: "PR-2", lines: [{ product: "Vaso de prueba", qty: "4" }] });
  await assert.rejects(execute(randomUUID(), { action: "allocate", sale_id: sale2, purchase_id: purchase, line: 1, qty: "3" }), /cantidad disponible/);
  await execute(randomUUID(), { action: "payment", purchase_id: purchase, amount: "20", paid_on: "2026-11-24" });
  const share = randomUUID();
  await execute(share, { action: "share", digest: "fixture", from: "2026-11-01", to: "2026-11-30", expires: "2026-12-31" });
  await execute(randomUUID(), { action: "revoke", share_id: share });
  assert.equal((await db.query("select revoked from account_shares")).rows[0].revoked, true);
  assert.equal(Number((await db.query("select sum(amount) total from account_payments where sale_id is not null")).rows[0].total), 115);
  assert.equal(Number((await db.query("select sum(qty) total from account_allocations")).rows[0].total), 2);
  console.log("PGlite: repeat migration, role isolation, legacy and new payments, retries, overpayments, allocation and revocation passed.");
} finally {
  await db.close();
}
