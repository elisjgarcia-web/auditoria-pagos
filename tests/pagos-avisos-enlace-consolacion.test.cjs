const {test}=require('node:test'),assert=require('node:assert/strict'),{PGlite}=require('@electric-sql/pglite'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
test('new link and explicitly sent consolation notify once, preserve rows and reject stale events',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create schema auth;create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create schema privado_resultados;create table privado_resultados.publicadores_resultados(usuario_id uuid,activo boolean);
 create schema privado_en_vivo;create table privado_en_vivo.cortes_reinicio(fecha date,source text,revisiones jsonb,registrado_en timestamptz);
 create function privado_en_vivo.es_pagos() returns boolean language sql as $$select true$$;
 create function privado_en_vivo.source_actual() returns text language sql as $$select coalesce(nullif(current_setting('test.source',true),''),'88')$$;
 create table public.en_vivo_envios(id uuid primary key,fecha date,source text,ronda int,revision int,capturas jsonb);
 create table public.en_vivo_jornadas(fecha date,source text,youtube text,youtube_actualizado_en timestamptz);
 create table public.slot_premios_sesiones(id uuid primary key,source_anchor text,state jsonb);
 create schema extensions;create function extensions.hmac(v text,k text,alg text) returns bytea language sql as $$select decode(md5(v||k)||md5(k||v),'hex')$$;
 create schema net;create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds int) returns bigint language sql as $$select 1::bigint$$;`);
 await db.exec(read('supabase/presentadora-push.sql'));await db.exec(read('supabase/pagos-avisos-enlace-consolacion.sql'));
 const hoy=(await db.query("select (now() at time zone 'America/Caracas')::date::text as d")).rows[0].d;
 const count=async()=> (await db.query('select count(*)::int as n from privado_push.cola')).rows[0].n;
 await db.query("insert into public.en_vivo_jornadas values($1,'88',null,null)",[hoy]);assert.equal(await count(),0);
 await db.query("update public.en_vivo_jornadas set youtube='https://www.youtube.com/watch?v=abcdefghijk',youtube_actualizado_en=now() where fecha=$1",[hoy]);assert.equal(await count(),1);
 await db.exec("update public.en_vivo_jornadas set youtube_actualizado_en=now()");assert.equal(await count(),1);
 const first=(await db.query("select id from privado_push.cola where payload->>'type'='youtube'")).rows[0].id;
 assert.ok((await db.query('select privado_push.tomar($1) as j',[first])).rows[0].j);
 await db.exec("update public.en_vivo_jornadas set youtube='https://www.youtube.com/watch?v=lmnopqrstuv',youtube_actualizado_en=now()");assert.equal(await count(),2);
 await db.exec("update privado_push.cola set lease_hasta=null,estado='pendiente'");
 assert.equal((await db.query('select privado_push.tomar($1) as j',[first])).rows[0].j,null);
 const session='20000000-0000-4000-8000-000000000001';
 const winner=(id,type='consolation')=>({drawId:id,prizeType:type,prize:type==='consolation'?'10 USD':'1 cartón gratis',date:hoy+'T20:00:00-04:00',ticket:'75'});
 let state={winners:[winner('a'),winner('free','other')],participants:[]};
 const save=()=>db.query('update public.slot_premios_sesiones set state=$1 where id=$2',[state,session]);
 await db.query("insert into public.slot_premios_sesiones values($1,'88',$2)",[session,state]);assert.equal(await count(),2);
 state.paymentSubmission={drawIds:['free']};await save();assert.equal(await count(),2);
 state.paymentSubmission.drawIds=['free','a'];await save();assert.equal(await count(),3);
 await save();state.winners.push(winner('b'));await save();assert.equal(await count(),3);
 state.paymentSubmission.drawIds.push('b');await save();assert.equal(await count(),4);
 const jobs=(await db.query("select id,payload from privado_push.cola where payload->>'type'='consolacion' order by creado_en")).rows;
 assert.equal(jobs.length,2);for(const job of jobs)assert.match(job.id,/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-8[a-f0-9]{3}-[a-f0-9]{12}$/);assert.deepEqual(jobs.map(j=>j.payload.cantidad),[1,1]);assert.ok(!JSON.stringify(jobs).includes('10 USD'));
 assert.ok((await db.query('select privado_push.tomar($1) as j',[jobs[0].id])).rows[0].j);
 state.paymentSubmission.drawIds=['free'];await save();await db.exec("update privado_push.cola set lease_hasta=null,estado='pendiente'");
 assert.equal((await db.query('select privado_push.tomar($1) as j',[jobs[1].id])).rows[0].j,null);
 state.paymentSubmission.drawIds=['a'];await save();assert.equal(await count(),4); // idempotent re-submission
 await db.exec("select set_config('test.source','99',false)");
 const second=(await db.query("select id from privado_push.cola where payload->>'type'='youtube' and id<>$1",[first])).rows[0].id;
 assert.equal((await db.query('select privado_push.tomar($1) as j',[second])).rows[0].j,null);
 await db.exec("select set_config('test.source','88',false)");
 state.winners.push({...winner('ayer'),date:'2020-01-01T20:00:00-04:00'});state.paymentSubmission.drawIds.push('ayer');await save();assert.equal(await count(),4);
 await db.exec('set role authenticated');await assert.rejects(db.query('select privado_push.encolar_consolacion()'),/permission denied/);
 await db.exec('reset role');
 // Even broken notification infrastructure must not reject a valid link write.
 await db.exec("create or replace function privado_push.despachar(p_id uuid default null) returns integer language plpgsql as $$begin raise exception 'network down';end$$");
 await db.exec("update public.en_vivo_jornadas set youtube='https://www.youtube.com/watch?v=123456789ab',youtube_actualizado_en=now()");
 assert.equal((await db.query('select youtube from public.en_vivo_jornadas')).rows[0].youtube,'https://www.youtube.com/watch?v=123456789ab');
 }finally{await db.close();}
});
test('worker gives link and consolation distinct messages and informs only Payments tabs',async()=>{
 const handlers={},shown=[],posted=[];const scope='https://app.test/auditoria-pagos/';
 const self={registration:{scope,showNotification:async(title,options)=>shown.push({title,options})},addEventListener:(n,f)=>handlers[n]=f,clients:{matchAll:async()=>[{url:scope,postMessage:m=>posted.push(m)},{url:scope+'presentadora/',postMessage:()=>assert.fail('not Payments')}]}};
 vm.runInNewContext(read('sw.js'),{self,URL});
 for(const type of ['youtube','consolacion']){let pending;handlers.push({data:{json:()=>({id:type,type,cantidad:5,fecha:'2026-11-06',source:'88'})},waitUntil:p=>pending=p});await pending;}
 assert.match(shown[0].title,/YouTube/);assert.match(shown[0].options.body,/Traer enlace de Presentadora/);
 assert.match(shown[1].title,/consolación/);assert.match(shown[1].options.body,/5 ganador.*Traer ganadores/);assert.equal(posted.length,2);
});
test('open Payments banner scopes push to the current draw and never imports winners or links',async()=>{
 const {JSDOM}=require('jsdom'),dom=new JSDOM(read('index.html'),{url:'https://local.test/',runScripts:'outside-only'}),w=dom.window;
 try{
 let listener;Object.defineProperty(w.navigator,'serviceWorker',{value:{addEventListener:(name,cb)=>{assert.equal(name,'message');listener=cb;}}});
 w.document.getElementById('fechaSorteo').value='06/11/2026';w.eval("var SLOT_APPROVED_SOURCE='88'");
 w.PagosPush={activo:true};w.eval(read('rondas-en-vivo-comun.js'));w.eval(read('recibir-en-vivo.js'));
 const banner=w.document.getElementById('envivoAvisoNuevo'),event=(id,type,fecha='2026-11-06',source='88')=>({data:{type:'pagos-aviso',aviso:{id,type,fecha,source}}});
 listener(event('old','youtube','2026-11-05'));assert.equal(banner.hidden,true);
 listener(event('other','consolacion','2026-11-06','99'));assert.equal(banner.hidden,true);
 listener(event('youtube','youtube'));assert.match(banner.textContent,/Traer enlace de Presentadora/);
 listener(event('cons','consolacion'));assert.match(banner.textContent,/Traer ganadores/);
 listener(event('youtube','youtube'));assert.match(banner.textContent,/Traer ganadores/); // duplicate ignored
 assert.equal(w.document.getElementById('cartonesCon').value,'');
 }finally{w.close();}
});
