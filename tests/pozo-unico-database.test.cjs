const{test}=require('node:test'),assert=require('node:assert/strict'),{PGlite}=require('@electric-sql/pglite'),fs=require('node:fs'),path=require('node:path');
const OWNER='00000000-0000-0000-0000-000000000001',E1='11111111-1111-4111-8111-111111111111',E2='22222222-2222-4222-8222-222222222222';
async function fixture(){const db=new PGlite();await db.exec(`create role anon;create role authenticated;create schema auth;
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
grant usage on schema auth to authenticated;create schema privado_en_vivo;create schema privado_pagos;grant usage on schema privado_pagos to authenticated;
create table public.inscripciones(id bigint,estado text,cartones bigint[]);insert into public.inscripciones values(88,'aprobado',array[325]),(89,'aprobado',array[872]);
create function privado_en_vivo.es_pagos() returns boolean language sql as $$select auth.uid()='${OWNER}'::uuid$$;
create function privado_en_vivo.source_actual() returns text language sql as $$select min(id)::text from public.inscripciones$$;
create table privado_pagos.sesiones(source text primary key,estado jsonb,pagos jsonb,revision bigint,form_revision bigint,actualizado timestamptz);
create table public.en_vivo_envios(id uuid,fecha date,source text,ronda integer,revision integer,capturas jsonb);
create table privado_en_vivo.cortes_reinicio(fecha date,source text,revisiones jsonb);
create function privado_pagos.sincronizar(a jsonb) returns jsonb language sql security definer as $$select jsonb_build_object('source',source,'revision',revision,'formRevision',form_revision,'state',estado,'payments',pagos) from privado_pagos.sesiones where source=a->>'source'$$;`);
const date=(await db.query("select (now() at time zone 'America/Caracas')::date::text f")).rows[0].f;
const form={fechaSorteo:date.split('-').reverse().join('/'),cant:'5',premioPozo:'500',cartonPozo:'',cartonesCon:'',rondas:[{i:1,pre:'1000',car:'325, 872',nom:'Ronda 1'},{i:2,pre:'2000',car:'325',nom:'Ronda 2'}]};
await db.query("insert into privado_pagos.sesiones values('88',$1::jsonb,'{}',1,1,now())",[JSON.stringify({form,top:false,paymentKeys:[]})]);
await db.query("insert into public.en_vivo_envios values($1,$2,'88',1,1,'[{\"cartones\":[325]},{\"cartones\":[872]}]'),($3,$2,'88',2,1,'[{\"cartones\":[325]}]')",[E1,date,E2]);
await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/pozo-unico-diario.sql'),'utf8'));
const as=async(role='authenticated',id=OWNER)=>{await db.exec('reset role');await db.query("select set_config('test.uid',$1,false)",[id]);await db.exec('set role '+role);};
const claim=(extra={},base={})=>db.query('select public.pagos_sincronizar($1::jsonb) r',[JSON.stringify({action:'pozo',source:'88',formRevision:1,pozo:{fecha:date,ronda:1,envio:E1,bolitas:49,manual:false,premioRonda:'1000',premioPozo:'500',...extra},...base})]);await as();return{db,date,form,as,claim};}
test('suma pozo una sola vez; reintento y segundo teléfono no lo duplican; otra ronda y otro sorteo del mismo día se bloquean',async()=>{
 const x=await fixture();try{
 const r=(await x.claim()).rows[0].r;assert.equal(r.state.form.rondas[0].pre,'1500');assert.equal(r.state.form.cartonPozo,'');assert.equal(r.pozo.premio_ronda,1000);assert.equal(r.pozo.premio_pozo,500);assert.deepEqual(r.pozo.cartones,[325,872]);assert.equal(r.pozo.total,1500);
 assert.equal((await x.claim()).rows[0].r.state.form.rondas[0].pre,'1500');
 await assert.rejects(x.claim({ronda:2,envio:E2,premioRonda:'2000'}),/una vez por día/);
 await x.as('postgres');await x.db.exec("update public.inscripciones set id=id+100;insert into privado_pagos.sesiones select '188',estado,pagos,revision,form_revision,actualizado from privado_pagos.sesiones where source='88'");await x.as();
 await assert.rejects(x.claim({}, {source:'188'}),/una vez por día/);
 await x.as('postgres');assert.equal((await x.db.query('select count(*) n from privado_pagos.pozo_diario')).rows[0].n,1);assert.equal((await x.db.query('select count(*) n from public.inscripciones')).rows[0].n,2);
 }finally{await x.db.close();}
});
test('sin autorización, captura archivada, 53 bolas, monto distinto, cartones sin aprobación y pago ya realizado no consumen pozo',async()=>{
 const x=await fixture();try{
 await x.as('anon','');await assert.rejects(x.claim(),/permission denied/);await x.as('authenticated',E1);await assert.rejects(x.claim(),/no autorizado/);await x.as();
 await assert.rejects(x.claim({bolitas:53}),/52 bolitas/);await assert.rejects(x.claim({premioRonda:'900'}),/Cambió el premio/);await assert.rejects(x.claim({}, {formRevision:0}),/Otro teléfono/);
 await x.as('postgres');await x.db.query("insert into privado_en_vivo.cortes_reinicio values($1,'88','{\"1\":1}')",[x.date]);await x.as();await assert.rejects(x.claim(),/reiniciadas/);
 await x.as('postgres');await x.db.exec("delete from privado_en_vivo.cortes_reinicio;update privado_pagos.sesiones set pagos='{\"pagosBtns1|325|ana|500\":true}'");await x.as();await assert.rejects(x.claim(),/pagos realizados/);
 await x.as('postgres');assert.equal((await x.db.query('select count(*) n from privado_pagos.pozo_diario')).rows[0].n,0);
 }finally{await x.db.close();}
});
test('el reinicio limpia la pantalla sin liberar el pozo; el premio combinado no puede sobrescribirse con valores anteriores',async()=>{
 const x=await fixture();try{
 await x.claim();await x.as('postgres');await assert.rejects(x.db.exec("update privado_pagos.sesiones set estado=jsonb_set(estado,'{form,rondas,0,pre}','\"1000\"')"),/incluye el pozo/);
 const empty={form:{...x.form,rondas:x.form.rondas.map(r=>({...r,car:'',pre:''}))},top:false,paymentKeys:[]};await x.db.query('update privado_pagos.sesiones set estado=$1::jsonb',[JSON.stringify(empty)]);
 empty.form.rondas[1].car='325';empty.form.rondas[1].pre='2000';await x.db.query('update privado_pagos.sesiones set estado=$1::jsonb',[JSON.stringify(empty)]);
 await x.as();const r=(await x.db.query("select public.pagos_sincronizar('{\"action\":\"read\",\"source\":\"88\"}') r")).rows[0].r;assert.equal(r.pozo.total,1500);
 await assert.rejects(x.claim({ronda:2,envio:E2,premioRonda:'2000'}),/una vez por día/);
 }finally{await x.db.close();}
});
test('la confirmación manual también se suma a la ronda y consume el único pozo diario',async()=>{
 const x=await fixture();try{const r=(await x.claim({manual:true,bolitas:null,envio:null})).rows[0].r;assert.equal(r.pozo.manual,true);assert.equal(r.pozo.bolitas,null);assert.equal(r.state.form.rondas[0].pre,'1500');await assert.rejects(x.claim({manual:true,ronda:2,envio:null,premioRonda:'2000'}),/una vez por día/);}finally{await x.db.close();}
});
