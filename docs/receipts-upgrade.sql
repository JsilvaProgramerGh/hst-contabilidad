alter table public.invoices
  add column if not exists receipt_status text not null default 'PENDIENTE_PAGO',
  add column if not exists delivery_date date,
  add column if not exists delivery_time text,
  add column if not exists client_name text,
  add column if not exists client_phone text,
  add column if not exists client_email text,
  add column if not exists client_address text,
  add column if not exists total numeric(12,2) not null default 0,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'invoices_receipt_status_check'
  ) then
    alter table public.invoices
      add constraint invoices_receipt_status_check
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

create unique index if not exists invoices_quote_id_unique
  on public.invoices (quote_id);

alter table public.delivery_orders
  add column if not exists source_quote_id uuid,
  add column if not exists source_invoice_id uuid,
  add column if not exists source_kind text;

create unique index if not exists delivery_orders_source_invoice_id_unique
  on public.delivery_orders (source_invoice_id)
  where source_invoice_id is not null;

create or replace function public.set_invoices_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_invoices_updated_at on public.invoices;

create trigger trg_invoices_updated_at
before update on public.invoices
for each row execute function public.set_invoices_updated_at();
