/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS harness loads TypeScript calculations. */
const assert=require('node:assert/strict');
const fs=require('node:fs');const ts=require('typescript');
const path=require('node:path');const {createRequire}=require('node:module');const {randomUUID}=require('node:crypto');
require.extensions['.ts']=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);
const {decimalInput,normalizeAccountingValues}=require('../lib/decimal-input.ts');
for(const [input,expected] of [['125,50','125.50'],['125.50','125.50'],[',50','0.50'],['.50','0.50'],['0','0'],[' 00125,05 ','125.05'],['',''],['125,','125']])assert.equal(decimalInput(input),expected);
for(const value of ['1,234.56','1.234,56','1 000','1e3','NaN','Infinity','-1','12,345','12..5'])assert.throws(()=>decimalInput(value));
assert.equal(decimalInput('0,1250',4),'0.1250');
assert.deepEqual(normalizeAccountingValues({number:'001-009',gross:'125,50',lines:[{product:'A',qty:'1,2500'}]}),{number:'001-009',gross:'125.50',lines:[{product:'A',qty:'1.2500'}]});
(async()=>{
 const fixture=createRequire(path.resolve(process.env.HST_SQL_CHECK_DIR??'../hst-sql-check','package.json'));const {PGlite}=fixture('@electric-sql/pglite');const db=new PGlite();
 try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create table public.account_requests(id uuid primary key,payload jsonb);');
  await db.exec(fs.readFileSync(path.join(__dirname,'../docs/accounting-treasury.sql'),'utf8'));
  const values=normalizeAccountingValues({action:'treasury_settings',opening_main:'520,50',opening_petty:'15.25',opening_capital:'500,00',working_reserve:'200.50',other_reserve:'0',tax_reserve:''});
  await db.query('select public.hst_treasury_write($1,$2::jsonb)',[randomUUID(),JSON.stringify(values)]);
  const {rows}=await db.query('select opening_main::text main,opening_petty::text petty,tax_reserve from public.account_treasury_settings');
  assert.deepEqual(rows,[{main:'520.50',petty:'15.25',tax_reserve:null}]);
  console.log('Decimal inputs: comma, point, precision, rejected ambiguous formats and exact database persistence passed.');
 }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
