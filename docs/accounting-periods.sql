begin;

create table if not exists public.account_sales (
 id uuid primary key,
 number text not null unique check (btrim(number) <> ''),
 customer text not null check (btrim(customer) <> ''),
 issued date not null,
 due date check (due >= issued),
 gross numeric(14,2) not null check (gross > 0 and gross <> 'NaN'::numeric),
 vat numeric(14,2) check (vat between 0 and gross),
 discount numeric(14,2) check (discount >= 0 and discount <> 'NaN'::numeric)
);
alter table public.account_sales add column if not exists pdf_path text;
create table if not exists public.account_sale_lines (
 sale_id uuid not null references public.account_sales(id),
 line integer not null,
 product text not null check (btrim(product) <> ''),
 qty numeric(14,4) not null check (qty > 0 and qty <> 'NaN'::numeric),
 primary key (sale_id, line)
);
create table if not exists public.account_purchases (
 id uuid primary key,
 kind text not null check (kind in ('producto','gasto')),
 supplier text not null check (btrim(supplier) <> ''),
 reference text not null check (btrim(reference) <> ''),
 line_reference text not null check (btrim(line_reference) <> ''),
 description text not null check (btrim(description) <> ''),
 issued date not null,
 qty numeric(14,4) not null check (qty > 0 and qty <> 'NaN'::numeric),
 gross numeric(14,2) not null check (gross >= 0 and gross <> 'NaN'::numeric),
 vat numeric(14,2) check (vat between 0 and gross),
 eligible numeric(7,4) check (eligible between 0 and 100),
 unique (supplier, reference, line_reference)
);
alter table public.account_purchases add column if not exists pdf_path text;
create table if not exists public.account_allocations (
 sale_id uuid not null references public.account_sales(id),
 line integer,
 purchase_id uuid not null references public.account_purchases(id),
 qty numeric(14,4) not null check (qty > 0 and qty <> 'NaN'::numeric),
 foreign key (sale_id, line) references public.account_sale_lines(sale_id, line)
);
create index if not exists account_allocations_sale_line_idx on public.account_allocations(sale_id,line);
create index if not exists account_allocations_lot_idx on public.account_allocations(purchase_id);
create table if not exists public.account_payments (
 id uuid primary key,
 sale_id uuid references public.account_sales(id),
 legacy_id bigint references public.facturas(id),
 purchase_id uuid references public.account_purchases(id),
 amount numeric(14,2) not null check (amount > 0 and amount <> 'NaN'::numeric),
 paid_on date not null,
 note text,
 check (num_nonnulls(sale_id, legacy_id, purchase_id) = 1)
);
create index if not exists account_payments_sale_idx on public.account_payments(sale_id);
create index if not exists account_payments_legacy_idx on public.account_payments(legacy_id);
create index if not exists account_payments_purchase_idx on public.account_payments(purchase_id);
create table if not exists public.account_cash_entries (
 id uuid primary key,
 type text not null check (type in ('INGRESO_OTRO','GASTO')),
 amount numeric(14,2) not null check (amount > 0 and amount <> 'NaN'::numeric),
 date date not null,
 description text not null check (btrim(description) <> '')
);
create table if not exists public.account_legacy_details (
 legacy_id bigint primary key references public.facturas(id),
 due date,
 lines jsonb not null check (jsonb_typeof(lines)='array')
);
create table if not exists public.account_shares (
 id uuid primary key,
 digest text not null unique,
 from_date date,
 to_date date,
 expires date not null,
 revoked boolean not null default false,
 check (from_date <= to_date)
);
create table if not exists public.account_requests (
 id uuid primary key,
 payload jsonb not null
);

do $$
declare tbl text;
begin
 foreach tbl in array array['account_sales','account_sale_lines','account_purchases','account_allocations','account_payments','account_shares','account_requests','account_legacy_details','account_cash_entries'] loop
   execute format('alter table public.%I enable row level security', tbl);
   execute format('revoke all on public.%I from public, anon, authenticated', tbl);
   execute format('grant select, insert, update on public.%I to service_role', tbl);
 end loop;
end $$;

create or replace function public.hst_account_write(p_id uuid, p_data jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare
 previous jsonb;
 invoice uuid := nullif(p_data->>'sale_id','')::uuid;
 lot uuid := nullif(p_data->>'purchase_id','')::uuid;
 legacy bigint := nullif(p_data->>'legacy_id','')::bigint;
 amount numeric(14,2) := nullif(p_data->>'amount','')::numeric;
 quantity numeric(14,4) := nullif(p_data->>'qty','')::numeric;
 total numeric;
 used numeric;
 prior_paid numeric;
 sale_qty numeric;
 sale_date date;
 lot_date date;
 lot_kind text;
 payment_date date := nullif(p_data->>'paid_on','')::date;
 line_no integer := nullif(p_data->>'line','')::integer;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_id::text, 0));
 select payload into previous from public.account_requests where id=p_id;
 if found then
   if previous <> p_data then raise exception 'La solicitud ya se usó con otros datos.' using errcode='P0001'; end if;
   return;
 end if;
 if p_data->>'action' in ('sale','legacy_details') then
   if jsonb_typeof(p_data->'lines') is distinct from 'array' or jsonb_array_length(p_data->'lines') not between 1 and 500 then
     raise exception 'Registra entre 1 y 500 líneas.' using errcode='P0001';
   end if;
   if exists (select 1 from jsonb_array_elements(p_data->'lines') item where
     coalesce(btrim(item->>'product'),'') = '' or coalesce((item->>'qty')::numeric,0) <= 0) then
     raise exception 'Revisa el producto y la cantidad de cada línea.' using errcode='P0001';
   end if;
 end if;
 case p_data->>'action'
 when 'sale' then

   if exists(select 1 from public.facturas where numero = btrim(p_data->>'number')) then
     raise exception 'El número ya existe en las facturas importadas.' using errcode='P0001';
   end if;
   insert into public.account_sales(id,number,customer,issued,due,gross,vat,discount,pdf_path)
   values(p_id,btrim(p_data->>'number'),btrim(p_data->>'customer'),(p_data->>'issued')::date,
     nullif(p_data->>'due','')::date,(p_data->>'gross')::numeric,nullif(p_data->>'vat','')::numeric,nullif(p_data->>'discount','')::numeric,p_data->>'pdf_path');
   insert into public.account_sale_lines
   select p_id, position::integer, btrim(entry->>'product'), (entry->>'qty')::numeric
   from jsonb_array_elements(p_data->'lines') with ordinality as x(entry,position);
 when 'purchase' then
   insert into public.account_purchases(id,kind,supplier,reference,line_reference,description,issued,qty,gross,vat,eligible,pdf_path)
   values(p_id,p_data->>'kind',btrim(p_data->>'supplier'),btrim(p_data->>'reference'),btrim(p_data->>'line_reference'),
     btrim(p_data->>'description'),(p_data->>'issued')::date,quantity,(p_data->>'gross')::numeric,
     nullif(p_data->>'vat','')::numeric,nullif(p_data->>'eligible','')::numeric,p_data->>'pdf_path');
 when 'purchase_vat' then
   update public.account_purchases set
     vat=nullif(p_data->>'vat','')::numeric,
     eligible=nullif(p_data->>'eligible','')::numeric
   where id=lot;
   if not found then raise exception 'Comprobante no encontrado.' using errcode='P0001'; end if;
 when 'sale_vat' then
   update public.account_sales set
     vat=nullif(p_data->>'vat','')::numeric,
     discount=nullif(p_data->>'discount','')::numeric
   where id=invoice;
   if not found then raise exception 'Factura no encontrada.' using errcode='P0001'; end if;
 when 'payment' then
   if num_nonnulls(invoice,lot,legacy) <> 1 or amount is null or amount <= 0 or payment_date is null or
      payment_date > (now() at time zone 'America/Guayaquil')::date then
     raise exception 'Revisa el destino, monto y fecha del pago.' using errcode='P0001';
   end if;
   prior_paid := 0;
   if invoice is not null then
     select gross into total from public.account_sales where id=invoice for update;
     select coalesce(sum(pay.amount),0) into used from public.account_payments pay where sale_id=invoice;
   elsif lot is not null then
     select gross into total from public.account_purchases where id=lot for update;
     select coalesce(sum(pay.amount),0) into used from public.account_payments pay where purchase_id=lot;
   else
     select monto, case when lower(estado) in ('pagada','pagado') then monto else 0 end
     into total, prior_paid from public.facturas where id=legacy for update;
     select coalesce(sum(monto),0) into used from public.pagos_factura where factura_id=legacy;
     select greatest(used,coalesce(prior_paid,0)) + coalesce(sum(pay.amount),0) into used
       from public.account_payments pay where legacy_id=legacy;
   end if;
   if total is null or used+amount > total then
     raise exception 'El pago supera el saldo disponible o falta el documento.' using errcode='P0001';
   end if;
   insert into public.account_payments values(p_id,invoice,legacy,lot,amount,payment_date,nullif(p_data->>'note',''));
 when 'allocate' then
   select issued into sale_date from public.account_sales where id=invoice for update;
   select qty,kind,issued into total,lot_kind,lot_date from public.account_purchases where id=lot for update;
   select coalesce(sum(qty),0) into used from public.account_allocations where purchase_id=lot;
   if sale_date is null or total is null or quantity is null or quantity <= 0 or used+quantity > total or lot_date > sale_date then
     raise exception 'Revisa la fecha y la cantidad disponible del documento de compra.' using errcode='P0001';
   end if;
   if lot_kind='producto' then
     select qty into sale_qty from public.account_sale_lines where sale_id=invoice and line=line_no;
     if sale_qty is null or quantity + (select coalesce(sum(qty),0) from public.account_allocations where sale_id=invoice and line=line_no) > sale_qty then
       raise exception 'La asignación supera la cantidad de la línea de venta.' using errcode='P0001';
     end if;
   elsif line_no is not null then
     raise exception 'Asigna los gastos a la factura completa.' using errcode='P0001';
   end if;
   insert into public.account_allocations values(invoice,line_no,lot,quantity);
 when 'cash' then
   if payment_date is null or payment_date > (now() at time zone 'America/Guayaquil')::date then
     raise exception 'Revisa la fecha del movimiento.' using errcode='P0001';
   end if;
   insert into public.account_cash_entries values(p_id,p_data->>'type',amount,payment_date,btrim(p_data->>'description'));
 when 'legacy_details' then
   select coalesce(case when (to_jsonb(f)->>'fecha') ~ '^\d{4}-\d{2}-\d{2}$' then ((to_jsonb(f)->>'fecha')::date::timestamp at time zone 'America/Guayaquil') else f.fecha::timestamp at time zone 'UTC' end,(to_jsonb(f)->>'created_at')::timestamptz)
     at time zone 'America/Guayaquil' into sale_date
     from public.facturas f where id=legacy for update;
   if not found then raise exception 'Factura no encontrada.' using errcode='P0001'; end if;
   if nullif(p_data->>'due','')::date < sale_date then
     raise exception 'El vencimiento es anterior a la emisión.' using errcode='P0001';
   end if;
   insert into public.account_legacy_details values(legacy,nullif(p_data->>'due','')::date,p_data->'lines')
   on conflict (legacy_id) do update set due=excluded.due, lines=excluded.lines;
 when 'share' then
   insert into public.account_shares(id,digest,from_date,to_date,expires)
   values(p_id,p_data->>'digest',nullif(p_data->>'from','')::date,nullif(p_data->>'to','')::date,(p_data->>'expires')::date);
 when 'revoke' then
   update public.account_shares set revoked=true where id=(p_data->>'share_id')::uuid;
 else raise exception 'Operación inválida.' using errcode='P0001';
 end case;
 insert into public.account_requests values(p_id,p_data);
end $$;

revoke all on function public.hst_account_write(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.hst_account_write(uuid,jsonb) to service_role;

-- The replaced dashboard and viewer read historical accounting data through the server.
alter table public.facturas enable row level security;
alter table public.pagos_factura enable row level security;
alter table public.transactions enable row level security;
alter table public.share_links enable row level security;
revoke all on public.facturas, public.pagos_factura, public.transactions, public.share_links from public, anon, authenticated;
grant select, update on public.facturas to service_role;
grant select on public.pagos_factura, public.transactions to service_role;

-- Conserve the existing POS storage policies. Restrict the new accounting prefix.
do $$
begin
 if to_regclass('storage.objects') is not null then
   execute 'drop policy if exists hst_accounting_private on storage.objects';
   execute $policy$
     create policy hst_accounting_private on storage.objects as restrictive for all to anon, authenticated
     using (bucket_id <> 'invoices' or name not like 'accounting/%')
     with check (bucket_id <> 'invoices' or name not like 'accounting/%')
   $policy$;
 end if;
end $$;

notify pgrst, 'reload schema';
commit;
