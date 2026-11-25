-- Private export manifest. Run read-only and keep the output outside Git.
with invoices as (
  select id, monto, estado, pdf_url,
    case when fecha::text ~ '^\d{4}-\d{2}-\d{2}$' then fecha::text::date
      else (coalesce((fecha::timestamp at time zone 'UTC'), created_at)
        at time zone 'America/Guayaquil')::date end as issued
  from public.facturas
), receipts as (
  select factura_id, sum(monto) as paid, count(*) as payment_rows
  from public.pagos_factura group by factura_id
)
select f.id, f.issued, f.monto, f.estado, p.paid, coalesce(p.payment_rows,0) as payment_rows,
  f.pdf_url, o.metadata->>'size' as object_bytes,
  (select count(*) from invoices other where other.pdf_url=f.pdf_url) as invoice_references,
  case
    when coalesce(p.paid,0) >= f.monto and f.monto > 0 then 'Revisar respaldo y retención fiscal'
    else 'Conservar hasta reconciliar cobros'
  end as disposition
from invoices f left join receipts p on p.factura_id=f.id
left join storage.objects o on o.bucket_id='invoices' and o.name=f.pdf_url
where f.issued < date '2026-11-24'
  and (coalesce(p.paid,0) >= f.monto or lower(f.estado) in ('pagado','pagada'))
order by f.issued, f.id;
