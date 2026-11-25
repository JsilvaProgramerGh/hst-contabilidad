import { sharedPending } from "@/lib/accounting-server";
import { accountingPDF } from "@/lib/pdf/accountingPDF";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" };

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const report = await sharedPending(token);
  if (!report) return new Response("Enlace no disponible.", { status: 404, headers });
  const doc = accountingPDF(report.pending, report.range);
  return new Response(doc.output("arraybuffer"), { headers: {
    ...headers, "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="facturas-pendientes.pdf"',
  } });
}
