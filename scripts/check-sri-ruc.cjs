/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS TypeScript test harness. */
const assert=require('node:assert/strict');const fs=require('node:fs');const ts=require('typescript');
require.extensions['.ts']=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);
const {parseSriCustomer,fetchSriCustomer}=require('../lib/sri-ruc.ts');
const {getRucCandidate}=require('../lib/ruc-lookup.ts');
const ruc='1793225022001';
const record={numeroRuc:ruc,razonSocial:'EMPRESA DE PRUEBA',estadoContribuyenteRuc:'ACTIVO',actividadEconomicaPrincipal:'Prueba',representantesLegales:[{identificacion:'PRIVATE'}]};
assert.equal(getRucCandidate('1700000000'),'1700000000001');assert.equal(getRucCandidate('text'),null);
assert.equal(parseSriCustomer([record],ruc).name,'EMPRESA DE PRUEBA');
assert.equal(parseSriCustomer([record],ruc).representantesLegales,undefined);
assert.equal(parseSriCustomer([record],'0999999999001'),null);assert.equal(parseSriCustomer([],ruc),null);
assert.throws(()=>parseSriCustomer({},ruc));assert.throws(()=>parseSriCustomer([record,record],ruc));assert.throws(()=>parseSriCustomer([{...record,razonSocial:''}],ruc));
const original=global.fetch;
(async()=>{try {
 global.fetch=async()=>Response.json([record]);assert.equal((await fetchSriCustomer(ruc)).ruc,ruc);
 global.fetch=async()=>new Response('Unavailable',{status:503});await assert.rejects(fetchSriCustomer(ruc));
 global.fetch=async()=>new Response('<html>Verification required</html>');await assert.rejects(fetchSriCustomer(ruc));
 console.log('SRI lookup: exact match, absent/ambiguous/malformed results, no extra personal fields and source failures passed.');
}finally{global.fetch=original;}})().catch(e=>{console.error(e);process.exitCode=1;});
