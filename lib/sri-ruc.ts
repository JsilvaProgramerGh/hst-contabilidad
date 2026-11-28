export type SriCustomer = {
  ruc: string; name: string; status: string; activity: string;
  taxpayerType: string; updatedAt: string | null;
};
const text = (value: unknown, max = 500) => typeof value === 'string' ? value.trim().slice(0,max) : '';
export function parseSriCustomer(data: unknown, ruc: string): SriCustomer | null {
  if (!Array.isArray(data)) throw new Error('Unexpected SRI response');
  const matches = data.filter(row => row && typeof row === 'object' && row.numeroRuc === ruc);
  if (!matches.length) return null;
  if (matches.length !== 1 || !text(matches[0].razonSocial)) throw new Error('Ambiguous SRI response');
  const row = matches[0];
  return { ruc, name: text(row.razonSocial), status: text(row.estadoContribuyenteRuc,80),
    activity: text(row.actividadEconomicaPrincipal), taxpayerType: text(row.tipoContribuyente,80),
    updatedAt: text(row.informacionFechasContribuyente?.fechaActualizacion,40) || null };
}
export async function fetchSriCustomer(ruc: string, signal?: AbortSignal): Promise<SriCustomer | null> {
  const response = await fetch(`https://srienlinea.sri.gob.ec/sri-catastro-sujeto-servicio-internet/rest/ConsolidadoContribuyente/obtenerPorNumerosRuc?ruc=${ruc}`, {
    headers: { Accept: 'application/json' }, cache: 'no-store',
    signal: AbortSignal.any([AbortSignal.timeout(10000), ...(signal ? [signal] : [])]),
  });
  if (!response.ok) throw new Error('SRI unavailable');
  const content = await response.text();
  if (content.length > 200_000) throw new Error('Unexpected SRI response size');
  return parseSriCustomer(JSON.parse(content), ruc);
}
