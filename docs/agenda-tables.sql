create extension if not exists pgcrypto;

create table if not exists public.delivery_orders (
  id uuid primary key default gen_random_uuid(),
  delivery_date date not null,
  client_name text not null,
  phone text,
  address text not null,
  reference text,
  notes text,
  amount numeric(12,2) not null default 0,
  time_window text,
  priority text not null default 'MEDIA' check (priority in ('ALTA', 'MEDIA', 'BAJA')),
  status text not null default 'PENDIENTE' check (status in ('PENDIENTE', 'EN_RUTA', 'ENTREGADO', 'REPROGRAMADO', 'CANCELADO')),
  latitude numeric(10,7),
  longitude numeric(10,7),
  route_position integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists delivery_orders_date_idx
  on public.delivery_orders (delivery_date, status, priority);

create table if not exists public.task_agenda (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  details text,
  due_date date,
  due_time text,
  category text not null default 'GENERAL',
  contact_name text,
  contact_phone text,
  priority text not null default 'MEDIA' check (priority in ('ALTA', 'MEDIA', 'BAJA')),
  status text not null default 'PENDIENTE' check (status in ('PENDIENTE', 'EN_PROCESO', 'HECHO', 'CANCELADO')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists task_agenda_due_idx
  on public.task_agenda (due_date, status, priority);

create or replace function public.set_updated_at_generic()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_delivery_orders_updated_at on public.delivery_orders;
create trigger trg_delivery_orders_updated_at
before update on public.delivery_orders
for each row execute function public.set_updated_at_generic();

drop trigger if exists trg_task_agenda_updated_at on public.task_agenda;
create trigger trg_task_agenda_updated_at
before update on public.task_agenda
for each row execute function public.set_updated_at_generic();
