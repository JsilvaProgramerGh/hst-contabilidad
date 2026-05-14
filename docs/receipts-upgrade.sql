create extension if not exists pgcrypto;

create table if not exists public.quote_receipts (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null,
  invoice_no text not null,
  receipt_status text not null default 'PENDIENTE_PAGO',
  delivery_date date,
  delivery_time text,
  client_name text,
  client_phone text,
  client_email text,
  client_address text,
  total numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'quote_receipts_status_check'
  ) then
    alter table public.quote_receipts
      add constraint quote_receipts_status_check
      check (receipt_status in (
        'PENDIENTE_PAGO',
        'ABONADO',
        'PAGADO',
        'PENDIENTE_ENTREGA',
        'ENTREGADO',
        'ANULADO'
      ));
  end if;
end $$;

create unique index if not exists quote_receipts_quote_id_unique
  on public.quote_receipts (quote_id);

create unique index if not exists quote_receipts_invoice_no_unique
  on public.quote_receipts (invoice_no);

alter table public.delivery_orders
  add column if not exists source_quote_id uuid,
  add column if not exists source_receipt_id uuid,
  add column if not exists source_kind text;

create unique index if not exists delivery_orders_source_receipt_id_unique
  on public.delivery_orders (source_receipt_id)
  where source_receipt_id is not null;

create or replace function public.set_quote_receipts_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_quote_receipts_updated_at on public.quote_receipts;

create trigger trg_quote_receipts_updated_at
before update on public.quote_receipts
for each row execute function public.set_quote_receipts_updated_at();
