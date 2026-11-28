import {NextResponse} from 'next/server';
import {getRucCandidate} from '@/lib/ruc-lookup';
import {fetchSriCustomer} from '@/lib/sri-ruc';
export const runtime = 'nodejs';
export const maxDuration = 20;
const windows = new Map<string,{until:number;count:number}>();
const reply = (value:object,status=200) => NextResponse.json(value,{status,headers:{'Cache-Control':'private, no-store'}});
export async function POST(request:Request) {
  try {
    const raw=await request.text();
    if(raw.length>200) return reply({error:'Solicitud demasiado larga.'},413);
    const {document}=JSON.parse(raw);
    if(typeof document!=='string') return reply({error:'Escribe una cédula de 10 dígitos o un RUC de 13 dígitos.'},400);
    const ruc=getRucCandidate(document);
    if(!ruc) return reply({error:'Escribe una cédula de 10 dígitos o un RUC de 13 dígitos.'},400);
    const now=Date.now();
    for(const [ip,entry] of windows) if(entry.until<now) windows.delete(ip);
    const ip=request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'unknown';
    const previous=windows.get(ip);
    if(previous && previous.count>=15) return reply({error:'Has realizado varias consultas. Espera un minuto y vuelve a intentar.'},429);
    if(!previous&&windows.size>=1000) return reply({error:'La consulta está ocupada. Vuelve a intentar en un minuto.'},429);
    windows.set(ip,{until:previous?.until??now+60000,count:(previous?.count??0)+1});
    try {
      const customer=await fetchSriCustomer(ruc,request.signal);
      return reply({status:customer?'found':'absent',customer,ruc,source:'SRI',consultedAt:new Date().toISOString()});
    } catch { return reply({error:'El SRI no respondió a la consulta. Puedes reintentar sin perder los datos escritos.'},503); }
  } catch { return reply({error:'La solicitud de consulta no es válida.'},400); }
}
