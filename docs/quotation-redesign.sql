-- Apply before deploying the quotation redesign.
begin;

alter table public.quotes
  add column if not exists pdf_revision uuid;

alter table public.quote_items
  add column if not exists code text,
  add column if not exists details text,
  add column if not exists presentation text,
  add column if not exists image_url text,
  add column if not exists line_position integer;

-- Existing installations already enforce uniqueness via quotes_quote_no_key.
create unique index if not exists quotes_quote_no_key on public.quotes (quote_no);

-- Reserve issued numbers even if the corresponding quotation is deleted.
create table if not exists public.quote_number_allocations (
  quote_no text primary key
);
alter table public.quote_number_allocations enable row level security;
revoke all on public.quote_number_allocations from public, anon, authenticated;
grant select, insert on public.quote_number_allocations to service_role;

insert into public.quote_number_allocations (quote_no)
select quote_no from public.quotes where quote_no ~ '^[0-9]{8}-[0-9]{4}$'
on conflict do nothing;

create or replace function public.save_quotation(
  p_id text,
  p_quote jsonb,
  p_items jsonb
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  saved public.quotes;
  draft public.quotes;
  day_prefix text;
  candidate text;
  start_suffix integer;
  suffix_offset integer;
begin
  if p_id is null then
    draft := jsonb_populate_record(null::public.quotes, p_quote);
    if draft.date is null or coalesce(jsonb_array_length(p_items), 0) = 0 then
      raise exception 'La fecha y al menos una línea son obligatorias.' using errcode = '22023';
    end if;

    if draft.date::date not between date '0001-01-01' and date '9999-12-31' then
      raise exception 'La fecha de emisión no es válida.' using errcode = '22023';
    end if;
    day_prefix := to_char(draft.date::date, 'YYYYMMDD') || '-';
    start_suffix := floor(random() * 10000)::integer;
    -- A random start keeps ordinary allocations random. Scan every suffix on
    -- collision so a nearly full date can still use its remaining numbers.
    for suffix_offset in 0..9999 loop
      candidate := day_prefix || lpad(((start_suffix + suffix_offset) % 10000)::text, 4, '0');
      insert into public.quote_number_allocations (quote_no)
      values (candidate)
      on conflict do nothing;
      if not found then
        continue;
      end if;

      insert into public.quotes (
        quote_no, date, valid_days, client_name, client_id, client_phone,
        client_email, client_address, iva_rate, discount, delivery, paid,
        terms, notes, pdf_url, pdf_revision
      ) values (
        candidate, draft.date, coalesce(draft.valid_days, 15), draft.client_name,
        draft.client_id, draft.client_phone, draft.client_email, draft.client_address,
        draft.iva_rate, draft.discount, draft.delivery, draft.paid,
        draft.terms, draft.notes, draft.pdf_url, gen_random_uuid()
      )
      on conflict (quote_no) do nothing
      returning * into saved;
      exit when found;
    end loop;

    if saved.id is null then
      raise exception 'Ya se usaron los 10 000 números disponibles para esta fecha.'
        using errcode = 'P0001';
    end if;
  else
    draft := jsonb_populate_record(null::public.quotes, jsonb_build_object('id', p_id));
    select * into strict saved from public.quotes where id = draft.id for update;
    draft := jsonb_populate_record(saved, p_quote);
    update public.quotes set
      date = draft.date,
      valid_days = draft.valid_days,
      client_name = draft.client_name,
      client_id = draft.client_id,
      client_phone = draft.client_phone,
      client_email = draft.client_email,
      client_address = draft.client_address,
      iva_rate = draft.iva_rate,
      discount = draft.discount,
      delivery = draft.delivery,
      paid = draft.paid,
      terms = draft.terms,
      notes = draft.notes,
      pdf_revision = gen_random_uuid(),
      pdf_url = draft.pdf_url
    where id = saved.id
    returning * into saved;
  end if;

  if p_items is not null then
    delete from public.quote_items where quote_id = saved.id;
    insert into public.quote_items (
      quote_id, qty, description, unit, incl_vat, code, details,
      presentation, image_url, line_position
    )
    select saved.id, line.qty, line.description, line.unit, line.incl_vat,
      line.code, line.details, line.presentation, line.image_url, item.position::integer
    from jsonb_array_elements(p_items) with ordinality as item(value, position)
    cross join lateral jsonb_populate_record(null::public.quote_items, item.value) as line;
  end if;

  return to_jsonb(saved);
end;
$$;

revoke execute on function public.save_quotation(text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.save_quotation(text, jsonb, jsonb) to service_role;

notify pgrst, 'reload schema';
commit;
