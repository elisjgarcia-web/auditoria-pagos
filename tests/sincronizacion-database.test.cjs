const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const owner='5121c2ba-c8f1-40f8-8b3e-130a75f60ac5',other='00000000-0000-4000-8000-000000000099';
const a='00000000-0000-4000-8000-000000000001',b='00000000-0000-4000-8000-000000000002';
const state={form:{cant:'6',fechaSorteo:'30/10/2026',rondas:[{i:1,nom:'Ronda 1',pre:'100',car:'1,2'}]},top:false,paymentKeys:['pagosBtns1|1|ana|50','pagosBtns1|2|luis|50']};
async function fixture(){const db=new PGlite();await db.exec(`create role anon;create role authenticated;create schema auth;create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;create schema privado_resultados;create table privado_resultados.publicadores_resultados(usuario_id uuid,activo boolean);insert into privado_resultados.publicadores_resultados values('${owner}',true);create table public.inscripciones(id bigint primary key);insert into public.inscripciones values(80);grant usage on schema public,auth to anon,authenticated;`);await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/pagos-compartidos.sql'),'utf8'));await db.exec(`set test.uid='${owner}';set role authenticated;`);return db;}
const req=(device,action,more={})=>({device,source:'80',label:device===a?'Principal':'Pagos',action,op:crypto.randomUUID(),...more});
async function call(db,args){return (await db.query('select public.pagos_sincronizar($1) r',[JSON.stringify(args)])).rows[0].r;}
test('all authorized phones edit; stale writes cannot overwrite recent form changes; marks and retries remain isolated',async()=>{
 const db=await fixture();try{
 await db.exec('reset role;set role anon;');await assert.rejects(()=>call(db,req(a,'join')),/permission denied/);
 await db.exec(`reset role;set test.uid='${other}';set role authenticated;`);await assert.rejects(()=>call(db,req(a,'join')),/no autorizado/);
 await db.exec(`reset role;set test.uid='${owner}';set role authenticated;`);
 const first=await call(db,req(a,'join',{state}));assert.equal(first.controller,true);assert.equal(first.formRevision,1);
 const alternate=structuredClone(state);alternate.form.rondas[0].pre='999';
 const second=await call(db,req(b,'join',{state:alternate}));assert.equal(second.controller,true);assert.equal(second.state.form.rondas[0].pre,'100');
 await assert.rejects(()=>db.query('select * from privado_pagos.sesiones'),/permission denied/);
 const changed=structuredClone(state);changed.form.rondas[0].pre='200';
 assert.equal((await call(db,req(a,'save',{state:changed,formRevision:1}))).formRevision,2);
 await assert.rejects(()=>call(db,req(b,'save',{state:alternate,formRevision:1})),/Otro teléfono/);
 const read=await call(db,req(b,'read',{formRevision:1}));assert.equal(read.state.form.rondas[0].pre,'200');
 changed.form.rondas[0].pre='300';assert.equal((await call(db,req(b,'save',{state:changed,formRevision:2}))).formRevision,3);
 const k=state.paymentKeys[0],payment=req(b,'payment',{key:k,previous:false,value:true});
 const paid=await call(db,payment);assert.equal(paid.payments[k],true);assert.equal(paid.formRevision,3);
 assert.equal((await call(db,payment)).payments[k],true);
 await assert.rejects(()=>call(db,req(a,'payment',{key:k,previous:false,value:true})),/Otro teléfono/);
 await call(db,req(a,'payment',{key:state.paymentKeys[1],previous:false,value:true}));
 const both=await call(db,req(a,'read'));assert.equal(both.payments[k],true);assert.equal(both.payments[state.paymentKeys[1]],true);
 await assert.rejects(()=>call(db,req(b,'payment',{key:'inexistente',previous:false,value:true})),/no corresponde/);
 assert(both.events.some(e=>e.dispositivo==='Pagos'&&e.accion==='payment'));
 // Earlier app versions can still call claim/release without reserving exclusive editing.
 assert.equal((await call(db,req(a,'claim'))).controller,true);await call(db,req(a,'release'));
 assert.equal((await call(db,req(b,'save',{state:changed,formRevision:3}))).controller,true);
 await db.exec('reset role;delete from public.inscripciones;insert into public.inscripciones values(90);set role authenticated;');
 await assert.rejects(()=>call(db,req(a,'save',{state,formRevision:3})),/sorteo cambió/);
 assert.equal((await call(db,{...req(b,'join'),source:'90'})).hasState,false);
 }finally{await db.close();}
});
test('shared state rejects private/unknown fields and malformed payment catalogs',async()=>{
 const db=await fixture();try{
 await call(db,req(a,'join'));
 await assert.rejects(()=>call(db,req(a,'claim',{state:{...state,REGISTROS:[{cedula:'private'}]}})),/Campos/);
 await assert.rejects(()=>call(db,req(a,'claim',{state:{...state,form:{...state.form,textoLista:'private'}}})),/no compartibles/);
 await assert.rejects(()=>call(db,req(a,'claim',{state:{...state,form:{...state.form,rondas:[{i:1,pag:'private'}]}}})),/Rondas/);
 await assert.rejects(()=>call(db,req(a,'claim',{state:{...state,paymentKeys:[{}]}})),/Lista de pagos/);
 }finally{await db.close();}
});
const {crear}=require('../sincronizacion.js');
test('two automatic editors preserve in-flight edits and recover conflicts and offline saves without stale replay',async()=>{
 const db=await fixture();let offline=false,hold=null,release;
 function phone(device){let local=structuredClone(state),payments={},notices=[],backups=[];
 const engine=crear({device,label:()=>device===a?'Principal':'Ayudante',uuid:()=>crypto.randomUUID(),snapshot:()=>structuredClone(local),apply:s=>{local=structuredClone(s);},payments:p=>payments=p,roles:()=>{},events:()=>{},notice:s=>notices.push(s),backup:s=>backups.push(s),rpc:async args=>{if(offline)throw Error('Sin conexión');if(hold&&args.action==='save'){const h=hold;hold=null;await h;}return {data:await call(db,args)};}});
 return {engine,edit:amount=>local.form.rondas[0].pre=amount,get:()=>local,paid:()=>payments,notices,backups};}
 const p=phone(a),q=phone(b);
 try{
 await p.engine.conectar('80');await q.engine.conectar('80');assert.equal(p.engine.estado().controller,true);assert.equal(q.engine.estado().controller,true);
 p.edit('200');p.engine.programar();await p.engine.guardar();await q.engine.leer();assert.equal(q.get().form.rondas[0].pre,'200');
 assert.equal(await q.engine.marcar(state.paymentKeys[0]),true);await p.engine.leer();assert.equal(p.paid()[state.paymentKeys[0]],true);
 p.edit('300');p.engine.programar();hold=new Promise(r=>release=r);const saving=p.engine.guardar();await new Promise(r=>setImmediate(r));p.edit('400');p.engine.programar();release();await saving;await p.engine.guardar();await q.engine.leer();assert.equal(q.get().form.rondas[0].pre,'400');
 p.edit('500');p.engine.programar();offline=true;await p.engine.guardar();assert.equal(p.engine.estado().online,false);assert(p.backups.length>0);offline=false;await p.engine.leer();assert.equal(p.get().form.rondas[0].pre,'400');
 await q.engine.leer();p.edit('600');q.edit('700');p.engine.programar();q.engine.programar();await p.engine.guardar();assert.equal(await q.engine.guardar(),undefined);assert.equal(q.engine.estado().online,false);await q.engine.leer();assert.equal(q.get().form.rondas[0].pre,'600');assert(q.backups.length>0);q.edit('800');q.engine.programar();await q.engine.guardar();await p.engine.leer();assert.equal(p.get().form.rondas[0].pre,'800');
 }finally{await p.engine.salir();await q.engine.salir();await db.close();}
});
