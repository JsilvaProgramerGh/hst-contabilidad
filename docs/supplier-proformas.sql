begin;

create table if not exists public.supplier_proformas (
  id uuid primary key default gen_random_uuid(),
  fingerprint text not null unique,
  supplier_id uuid references public.inv_suppliers(id) on delete set null,
  supplier_key text not null,
  source jsonb not null check (jsonb_typeof(source->'items') = 'array'),
  created_at timestamptz not null default now()
);

alter table public.supplier_proformas enable row level security;
revoke all on public.supplier_proformas from public, anon, authenticated;
grant select, insert, update on public.supplier_proformas to service_role;
create index if not exists supplier_proformas_supplier_id_idx on public.supplier_proformas(supplier_id);

create or replace function public.search_supplier_offers(
  p_terms text[], p_supplier text, p_similar boolean, p_offset integer,
  p_identity text, p_variant uuid, p_reference text, p_supplier_key text, p_code text, p_basis jsonb
)
returns setof jsonb
language sql stable security invoker set search_path = ''
as $$
  select (p.source - 'items') || jsonb_build_object(
    'id', p.id, 'supplierId', p.supplier_id, 'line', item.position - 1, 'offer', item.offer
  )
  from public.supplier_proformas p
  cross join lateral jsonb_array_elements(p.source->'items') with ordinality item(offer, position)
  where (p_supplier = '' or strpos(p.supplier_key, p_supplier) > 0)
    and (
      case when p_similar then
        (p_identity <> '' and item.offer->>'identity' = p_identity)
        or (p_variant is not null and item.offer->>'variantId' = p_variant::text)
        or (p_reference <> '' and p.supplier_key = p_supplier_key and lower(item.offer->>'code') = p_reference)
        or (item.offer->'terms' ?| p_terms)
      else (item.offer->'terms') ?& p_terms or (p_code <> '' and lower(item.offer->>'code') = p_code) end
    )
  order by case when p_similar
      and ((p_variant is not null and item.offer->>'variantId' = p_variant::text)
        or (item.offer->>'identity' = p_identity
          and (p_variant is null or item.offer->>'variantId' is null)))
      and p.source->>'currency' = p_basis->>'currency'
      and p.source->>'tax' = p_basis->>'tax'
      and item.offer->>'unit' = p_basis->>'unit'
      and item.offer->>'unit' <> ''
      and p_basis->>'pack' is not null
      and item.offer->>'availability' <> 'no disponible'
      and (p.source->>'expires' is null or p.source->>'expires' >= p_basis->>'today')
    then (item.offer->>'price')::numeric / nullif((item.offer->>'pack')::numeric, 0)
    end asc nulls last,
    (p_similar and p_variant is not null and item.offer->>'variantId' = p_variant::text) desc nulls last,
    (p_similar and p_reference <> '' and p.supplier_key = p_supplier_key and lower(item.offer->>'code') = p_reference) desc,
    (p_similar and p_identity <> '' and item.offer->>'identity' = p_identity) desc,
    p.source->>'issued' desc nulls last, p.created_at desc, p.id, item.position
  offset greatest(p_offset, 0) limit 51
$$;

create or replace function public.link_supplier_offer(p_id uuid, p_line integer, p_variant uuid)
returns boolean
language sql volatile security invoker set search_path = ''
as $$
  with linked as (
    update public.supplier_proformas
    set source = jsonb_set(
      source, array['items', p_line::text, 'variantId'], coalesce(to_jsonb(p_variant), 'null'::jsonb)
    )
    where id = p_id and p_line >= 0 and (source->'items'->p_line) is not null
    returning 1
  )
  select exists(select 1 from linked)
$$;

revoke execute on function public.search_supplier_offers(text[], text, boolean, integer, text, uuid, text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.link_supplier_offer(uuid, integer, uuid) from public, anon, authenticated;
grant execute on function public.search_supplier_offers(text[], text, boolean, integer, text, uuid, text, text, text, jsonb) to service_role;
grant execute on function public.link_supplier_offer(uuid, integer, uuid) to service_role;

notify pgrst, 'reload schema';
commit;
