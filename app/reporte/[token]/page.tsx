import { notFound } from "next/navigation";
import { money } from "@/lib/accounting";
import { sharedPending } from "@/lib/accounting-server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Facturas pendientes | HST", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function ReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const report = await sharedPending(token);
  if (!report) notFound();
  const { pending, range } = report;
  return <main className="mx-auto grid max-w-4xl gap-5 p-5 text-slate-100 sm:p-10">
    <header className="grid gap-2">
      <p className="text-sm font-semibold text-teal-300">HST Contabilidad</p>
      <h1 className="text-3xl font-bold">Facturas pendientes</h1>
      <p>{range.from || "Todo el historial"} · {range.to || "Hasta hoy"}</p>
      <p className="font-semibold">{pending.length} facturas · {money(pending.reduce((sum, row) => sum + row.outstanding, 0))} pendientes</p>
      <a className="w-fit rounded-lg bg-teal-700 px-4 py-3 font-semibold text-white" rel="noreferrer" href={`/reporte/${token}/pdf`}>Descargar pendientes PDF</a>
    </header>
    {!pending.length && <p>No hay facturas pendientes en este período.</p>}
    {pending.map((row, index) => <article key={index} className="grid gap-2 rounded-xl border border-slate-700 bg-slate-900 p-4">
      <h2 className="font-semibold">{row.customer || "Cliente sin nombre"} · {row.number || "Sin número"}</h2>
      <p className="text-sm text-slate-300">Emisión {row.issued} · {row.due ? `Vence ${row.due}` : "Vencimiento sin registrar"}</p>
      {row.lines.length ? <ul className="list-disc pl-5">{row.lines.map((line) => <li key={line.line}>{line.product} × {line.qty}</li>)}</ul> : <p>Detalle de productos sin registrar.</p>}
      <p>Total {money(row.gross)} · Pagado {money(row.paid)} · <strong>Pendiente {money(row.outstanding)}</strong></p>
    </article>)}
  </main>;
}
