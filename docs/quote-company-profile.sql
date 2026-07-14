create extension if not exists pgcrypto;

create table if not exists public.quote_company_profile (
  id text primary key,
  name text not null,
  ruc text,
  address text,
  city text,
  phone text,
  email text,
  website text,
  logo_url text,
  accent_blue text not null default '#105fff',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.quote_company_profile (
  id,
  name,
  ruc,
  address,
  city,
  phone,
  email,
  website,
  logo_url,
  accent_blue
)
values (
  'default',
  'HST GLOBAL STORE',
  '0962974689001',
  'Direccion: Quevedo, calle guatemala y chile',
  'Ecuador',
  'WhatsApp: 0982124443',
  'Email: ventas@hstglobalstore.com',
  '',
  '/logo.png',
  '#105fff'
)
on conflict (id) do nothing;

create or replace function public.set_quote_company_profile_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_quote_company_profile_updated_at on public.quote_company_profile;

create trigger trg_quote_company_profile_updated_at
before update on public.quote_company_profile
for each row execute function public.set_quote_company_profile_updated_at();

alter table public.quote_company_profile enable row level security;

drop policy if exists "quote_company_profile_select_all" on public.quote_company_profile;
drop policy if exists "quote_company_profile_insert_all" on public.quote_company_profile;
drop policy if exists "quote_company_profile_update_all" on public.quote_company_profile;

create policy "quote_company_profile_select_all"
on public.quote_company_profile
for select
to anon, authenticated
using (true);

create policy "quote_company_profile_insert_all"
on public.quote_company_profile
for insert
to anon, authenticated
with check (true);

create policy "quote_company_profile_update_all"
on public.quote_company_profile
for update
to anon, authenticated
using (true)
with check (true);
