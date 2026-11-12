const {test}=require('node:test'),assert=require('node:assert/strict'),{PGlite}=require('@electric-sql/pglite'),fs=require('node:fs'),path=require('node:path');
const sql=fs.readFileSync(path.join(__dirname,'../supabase/presentadora-control.sql'),'utf8');
const uid='00000000-0000-0000-0000-000000000002',reset='11111111-1111-4111-8111-111111111111',otro='22222222-2222-4222-8222-222222222222';
const cinco=['1RA RONDA','2DA RONDA','3RA RONDA','4TA RONDA','CARTÓN LLENO FINAL'];
async function crear(){
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create schema auth;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 grant usage on schema auth to authenticated;grant execute on all functions in schema auth to authenticated;
 create schema privado_en_vivo;grant usage on schema privado_en_vivo to authenticated;
 create schema privado_pagos;
 create function privado_en_vivo.puede_enviar() returns boolean language sql as $$select auth.uid()='${uid}'::uuid$$;
 create function privado_en_vivo.source_actual() returns text language sql as $$select '88'::text$$;
 create table public.en_vivo_jornadas(fecha date,source text,rondas jsonb,youtube text,youtube_actualizado_en timestamptz,primary key(fecha,source));
 create table public.en_vivo_envios(id int,fecha date,source text,ronda int,revision int,capturas jsonb);
 create table privado_en_vivo.cortes_reinicio(fecha date,source text,revisiones jsonb,registrado_en timestamptz,registrado_por uuid,maestro_id uuid,maestro_en timestamptz,primary key(fecha,source));
 create table privado_pagos.sesiones(source text primary key,estado jsonb,pagos jsonb,revision bigint,form_revision bigint,actualizado timestamptz);
 create table public.inscripciones(id int);insert into public.inscripciones values(88),(89);
 create function public.en_vivo_cortes(p_fecha date) returns jsonb language sql security definer set search_path='' as $$select jsonb_build_object('source','88','maestro_id',c.maestro_id,'revisiones',c.revisiones) from privado_en_vivo.cortes_reinicio c where c.fecha=p_fecha and c.source='88'$$;
 revoke all on function public.en_vivo_cortes(date) from public,anon;grant execute on function public.en_vivo_cortes(date) to authenticated;`);
 await db.exec(sql);
 const fecha=(await db.query("select (now() at time zone 'America/Caracas')::date::text d")).rows[0].d;
 const f={cant:'5',fechaSorteo:fecha.split('-').reverse().join('/'),tasaCambio:'902',rondas:cinco.map((nom,i)=>({i:i+1,nom,pre:i===4?'198440':'36080',car:i===0?'75':''})),plantillaPremios:'auto'};
 await db.query('insert into public.en_vivo_jornadas values($1,\'88\',$2::jsonb,\'https://youtube.test\',now())',[fecha,JSON.stringify(cinco)]);
 await db.query("insert into privado_pagos.sesiones values('88',$1::jsonb,'{\"r1:75\":true}',3,3,now())",[JSON.stringify({form:f,top:true,paymentKeys:['r1:75']})]);
 await db.query("insert into public.en_vivo_envios values(1,$1,'88',1,1,'[{\"cartones\":[75]}]')",[fecha]);
 const as=async(role='authenticated',user=uid)=>{await db.exec('reset role');await db.query("select set_config('test.uid',$1,false)",[user]);await db.exec('set role '+role);};
 const change=async(n,rounds=cinco,master=null,source='88')=>(await db.query('select public.en_vivo_cambiar_cantidad($1,$2,$3,$4::jsonb,$5) r',[fecha,source,n,JSON.stringify(rounds),master])).rows[0].r;
 const restart=async(master=null,op=reset)=>(await db.query("select public.en_vivo_reiniciar_presentadora($1,'88',$2,$3) r",[fecha,master,op])).rows[0].r;
 await as();return{db,fecha,as,change,restart};
}
test('presentadora changes 5/6 rounds atomically; payments, first winners and final prize survive',async()=>{
 const x=await crear();try{
 const six=await x.change(6);assert.equal(six.rondas.length,6);assert.equal(six.rondas[4],'5TA RONDA');
 await x.as('postgres');let s=(await x.db.query('select * from privado_pagos.sesiones')).rows[0];
 assert.equal(s.estado.form.cant,'6');assert.equal(s.estado.form.rondas[0].car,'75');assert.equal(s.estado.form.rondas[4].pre,'');assert.equal(s.estado.form.rondas[5].pre,'198440');assert.equal(s.estado.form.plantillaPremios,'personal');assert.deepEqual(s.pagos,{'r1:75':true});assert.deepEqual(s.estado.paymentKeys,['r1:75']);assert.equal(s.form_revision,4);
 assert.equal((await x.db.query('select count(*) n from public.en_vivo_envios')).rows[0].n,1);
 await x.as();await assert.rejects(x.change(5),/Otro equipo/);await x.change(5,six.rondas);
 await x.as('postgres');s=(await x.db.query('select * from privado_pagos.sesiones')).rows[0];assert.equal(s.estado.form.rondas.length,5);assert.equal(s.estado.form.rondas[4].pre,'198440');assert.equal((await x.db.query('select count(*) n from public.inscripciones')).rows[0].n,2);
 }finally{await x.db.close();}
});
test('only authorized presenters can change/reset; stale source, master, invalid count and occupied final are rejected',async()=>{
 const x=await crear();try{
 await x.as('anon','');await assert.rejects(x.change(6),/permission denied/);await assert.rejects(x.restart(),/permission denied/);
 await x.as('authenticated','00000000-0000-0000-0000-000000000003');await assert.rejects(x.change(6),/autorizado/);await assert.rejects(x.restart(),/autorizado/);
 await x.as();await assert.rejects(x.change(7),/Revisa/);await assert.rejects(x.change(6,cinco,null,'old'),/Revisa/);await assert.rejects(x.change(6,cinco,otro),/Otro equipo/);
 await x.as('postgres');await x.db.query("insert into public.en_vivo_envios values(2,$1,'88',5,1,'[]')",[x.fecha]);await x.as();await assert.rejects(x.change(6),/capturas enviadas/);
 await x.as('postgres');await x.db.exec("delete from public.en_vivo_envios where id=2;update privado_pagos.sesiones set estado=jsonb_set(estado,'{form,rondas,4,car}','\"900\"')");await x.as();await assert.rejects(x.change(6),/Pagos ya tiene ganadores/);
 }finally{await x.db.close();}
});
test('reset archives all senders, preserves data, rejects stale requests and retries idempotently',async()=>{
 const x=await crear();try{
 await x.as('postgres');await x.db.query("insert into public.en_vivo_envios values(2,$1,'88',5,2,'[]')",[x.fecha]);const before=(await x.db.query('select estado,pagos from privado_pagos.sesiones')).rows[0];await x.as();
 const r=await x.restart();assert.equal(r.maestro_id,reset);assert.deepEqual(r.revisiones,{'1':1,'5':2});
 assert.equal((await x.restart()).maestro_id,reset);await assert.rejects(x.restart(null,otro),/Otro equipo/);
 await assert.rejects(x.change(6,cinco,null),/Otro equipo/);await x.change(6,cinco,reset);
 await x.as('postgres');const after=(await x.db.query('select estado,pagos from privado_pagos.sesiones')).rows[0];assert.deepEqual(after.pagos,before.pagos);assert.equal(after.estado.form.rondas[0].car,'75');assert.equal((await x.db.query('select count(*) n from public.en_vivo_envios')).rows[0].n,2);assert.equal((await x.db.query('select youtube from public.en_vivo_jornadas')).rows[0].youtube,null);
 }finally{await x.db.close();}
});

test('when Payments already has six rounds, repairing a five-round presenter preserves both existing prizes',async()=>{
 const x=await crear();try{
 await x.as('postgres');const r=(await x.db.query('select estado from privado_pagos.sesiones')).rows[0].estado;
 r.form.cant='6';r.form.rondas[4]={i:5,nom:'5TA RONDA',pre:'54120',car:''};r.form.rondas.push({i:6,nom:'CARTÓN LLENO FINAL',pre:'198440',car:''});
 await x.db.query('update privado_pagos.sesiones set estado=$1::jsonb',[JSON.stringify(r)]);await x.as();await x.change(6);await x.as('postgres');
 const f=(await x.db.query('select estado from privado_pagos.sesiones')).rows[0].estado.form;assert.equal(f.rondas[4].pre,'54120');assert.equal(f.rondas[5].pre,'198440');
 }finally{await x.db.close();}
});
