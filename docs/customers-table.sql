create extension if not exists pgcrypto;

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  document_type text check (document_type in ('CEDULA', 'RUC', 'PASAPORTE')) default 'CEDULA',
  document_number text,
  display_name text not null,
  legal_name text,
  email text,
  phone text,
  address text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists customers_document_unique
  on public.customers (document_type, document_number)
  where document_number is not null and btrim(document_number) <> '';

create or replace function public.set_customers_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

DROP TRIGGER IF EXISTS trg_customers_updated_at ON public.customers;
create trigger trg_customers_updated_at
before update on public.customers
for each row execute function public.set_customers_updated_at();
