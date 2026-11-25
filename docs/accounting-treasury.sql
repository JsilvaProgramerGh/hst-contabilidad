begin;
create table public.account_treasury_settings (
 id boolean primary key default true check(id),
 opening_main numeric(14,2) not null check(opening_main >= 0 and opening_main <> 'NaN'),
 opening_petty numeric(14,2) not null check(opening_petty >= 0 and opening_petty <> 'NaN'),
 opening_capital numeric(14,2) not null check(opening_capital >= 0 and opening_capital <> 'NaN'),
 working_reserve numeric(14,2) not null check(working_reserve >= 0 and working_reserve <> 'NaN'),
 other_reserve numeric(14,2) not null check(other_reserve >= 0 and other_reserve <> 'NaN'),
 tax_reserve numeric(14,2) check(tax_reserve >= 0 and tax_reserve <> 'NaN')
);
create table public.account_treasury_entries (
 id uuid primary key,
 kind text not null check(kind in ('contribution','capital_return','owner_draw','to_petty','to_main','petty_expense')),
 amount numeric(14,2) not null check(amount > 0 and amount <> 'NaN'),
 date date not null check(date >= '2026-11-24'),
 description text not null check(length(btrim(description)) between 1 and 500)
);
create index account_treasury_entries_date_idx on public.account_treasury_entries(date,id);
alter table public.account_treasury_settings enable row level security;
alter table public.account_treasury_entries enable row level security;
revoke all on public.account_treasury_settings,public.account_treasury_entries from public,anon,authenticated;
grant select,insert,update on public.account_treasury_settings,public.account_treasury_entries to service_role;
create function public.hst_treasury_write(p_id uuid,p_data jsonb) returns void
language plpgsql security invoker set search_path='' as $$
declare previous jsonb; entry_date date := nullif(p_data->>'date','')::date;
begin
 perform pg_advisory_xact_lock(hashtextextended('hst-treasury',0));
 select payload into previous from public.account_requests where id=p_id;
 if found then
  if previous <> p_data then raise exception 'La solicitud ya se usó con otros datos.' using errcode='P0001'; end if;
  return;
 end if;
 if p_data->>'action'='treasury_settings' then
  insert into public.account_treasury_settings values(true,(p_data->>'opening_main')::numeric,(p_data->>'opening_petty')::numeric,
   (p_data->>'opening_capital')::numeric,(p_data->>'working_reserve')::numeric,(p_data->>'other_reserve')::numeric,nullif(p_data->>'tax_reserve','')::numeric)
  on conflict(id) do update set opening_main=excluded.opening_main,opening_petty=excluded.opening_petty,
   opening_capital=excluded.opening_capital,working_reserve=excluded.working_reserve,other_reserve=excluded.other_reserve,tax_reserve=excluded.tax_reserve;
 elsif p_data->>'action'='treasury_entry' then
  if not exists(select 1 from public.account_treasury_settings) then raise exception 'Configura primero los saldos iniciales.' using errcode='P0001'; end if;
  if entry_date is null or entry_date > (now() at time zone 'America/Guayaquil')::date then raise exception 'Revisa la fecha del movimiento.' using errcode='P0001'; end if;
  insert into public.account_treasury_entries values(p_id,p_data->>'kind',(p_data->>'amount')::numeric,entry_date,btrim(p_data->>'description'));
 else raise exception 'Operación inválida.' using errcode='P0001'; end if;
 insert into public.account_requests values(p_id,p_data);
end $$;
revoke all on function public.hst_treasury_write(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.hst_treasury_write(uuid,jsonb) to service_role;
notify pgrst, 'reload schema';
commit;
