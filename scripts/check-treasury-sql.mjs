import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
const require = createRequire(resolve(process.env.HST_SQL_CHECK_DIR ?? '../hst-sql-check','package.json'));
const {PGlite}=require('@electric-sql/pglite');const db=new PGlite();
try {
 await db.exec('create role anon; create role authenticated; create role service_role bypassrls; create table public.account_requests(id uuid primary key,payload jsonb); grant select,insert on public.account_requests to service_role;');
 await db.exec(await readFile(new URL('../docs/accounting-treasury.sql',import.meta.url),'utf8'));
 const write=(id,data)=>db.query('select public.hst_treasury_write($1,$2::jsonb)',[id,JSON.stringify(data)]);
 await db.exec('set role anon');await assert.rejects(db.query('select * from public.account_treasury_settings'),/permission denied/);
 await assert.rejects(write(randomUUID(),{}),/permission denied/);await db.exec('reset role;set role service_role;');
 const id=randomUUID();const config={action:'treasury_settings',opening_main:1000,opening_petty:0,opening_capital:1000,working_reserve:1000,other_reserve:0,tax_reserve:''};
 await write(id,config);await write(id,config);await assert.rejects(write(id,{...config,opening_main:2000}),/ya se usó/);
 const e=randomUUID(),event={action:'treasury_entry',kind:'to_petty',amount:100,date:'2026-11-24',description:'Fondo de caja chica'};
 await write(e,event);await write(e,event);assert.equal((await db.query('select count(*)::integer n from public.account_treasury_entries')).rows[0].n,1);
 for(const extra of [{amount:-1},{amount:'NaN'},{kind:'inventado'},{date:'2026-11-23'},{date:'2099-01-01'},{description:''}])await assert.rejects(write(randomUUID(),{...event,...extra}));
 console.log('SQL: permissions, atomic idempotent writes, invalid amounts, types and dates passed.');
} finally {await db.close();}
