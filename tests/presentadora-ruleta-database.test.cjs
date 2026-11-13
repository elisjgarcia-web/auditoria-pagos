const{test}=require('node:test'),assert=require('node:assert/strict'),{PGlite}=require('@electric-sql/pglite'),fs=require('node:fs'),path=require('node:path');
const UID='00000000-0000-0000-0000-000000000002',MASTER='11111111-1111-4111-8111-111111111111';
test('envío desde presentadora incluye todas las capturas vigentes, deduplica personas y conserva compras; autorización, reinicio y cartones ambiguos se validan',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create schema auth;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;grant usage on schema auth to authenticated;
 create schema privado_en_vivo;grant usage on schema privado_en_vivo to authenticated;create schema privado_slot_rondas;
 create function privado_en_vivo.puede_enviar() returns boolean language sql as $$select auth.uid()='${UID}'::uuid$$;
 create table public.inscripciones(id bigint,nombre text,cedula text,estado text,cartones bigint[]);
 insert into public.inscripciones values(88,'Ana Ejemplo','123','aprobado',array[75,76]),(89,'Luis Ejemplo','456','aprobado',array[99]),(90,'Pendiente','789','pendiente',array[100]);
 create function privado_en_vivo.source_actual() returns text language sql as $$select min(id)::text from public.inscripciones$$;
 create table public.en_vivo_jornadas(fecha date,source text,rondas jsonb);
 create table public.en_vivo_envios(fecha date,source text,ronda int,revision int,capturas jsonb);
 create table privado_en_vivo.cortes_reinicio(fecha date,source text,maestro_id uuid,revisiones jsonb);
 create table public.slot_rondas_excluidos(source_anchor text primary key,fecha date,enviados_por uuid,ganadores jsonb,enviados_en timestamptz default now());
 create function privado_slot_rondas.estado() returns jsonb language sql security definer as $$select jsonb_build_object('source',source_anchor,'sent',true,'people',(select count(distinct w->>'cedula') from jsonb_array_elements(ganadores) w),'winners',(select jsonb_agg(w-'cedula') from jsonb_array_elements(ganadores) w)) from public.slot_rondas_excluidos$$;`);
 const date=(await db.query("select (now() at time zone 'America/Caracas')::date::text f")).rows[0].f;
 await db.query("insert into public.en_vivo_jornadas values($1,'88','[\"1\",\"2\",\"3\",\"4\",\"Final\"]')",[date]);
 await db.query(`insert into public.en_vivo_envios values($1,'88',1,1,'[{"cartones":[100]}]'),($1,'88',1,2,'[{"cartones":[75]},{"cartones":[99,75]}]'),($1,'88',5,1,'[{"cartones":[76]}]'),($1,'old',2,1,'[{"cartones":[100]}]')`,[date]);
 await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/presentadora-ruleta.sql'),'utf8'));
 const as=async(role='authenticated',uid=UID)=>{await db.exec('reset role');await db.query("select set_config('test.uid',$1,false)",[uid]);await db.exec('set role '+role);};
 const call=(source='88',master=null,n=5)=>db.query('select public.en_vivo_enviar_ruleta($1,$2,$3,$4) r',[date,source,master,n]);
 await as('anon','');await assert.rejects(call(),/permission denied/);await as('authenticated',MASTER);await assert.rejects(call(),/autorizado/);
 await as();await assert.rejects(call('old'),/sorteo cambió/);await assert.rejects(call('88',MASTER),/Otro equipo/);await assert.rejects(call('88',null,6),/Otro equipo/);
 const r=(await call()).rows[0].r;assert.equal(r.people,2);assert.equal(r.rondasEnviadas,2);assert.deepEqual(r.rondasPendientes,[2,3,4]);assert.deepEqual(r.winners.map(w=>[w.ticket,w.round,w.type]),[['75',1,'ronda'],['99',1,'ronda'],['76',5,'final']]);assert(!JSON.stringify(r).includes('cedula'));
 assert.equal((await call()).rows[0].r.people,2);
 await as('postgres');assert.equal((await db.query('select count(*) n from public.inscripciones')).rows[0].n,3);
 await db.exec("insert into public.inscripciones values(91,'Ambiguo','999','aprobado',array[75])");await as();await assert.rejects(call(),/dueño aprobado único/);
 await as('postgres');assert.equal((await db.query('select jsonb_array_length(ganadores) n from public.slot_rondas_excluidos')).rows[0].n,3);
 await db.exec('delete from public.inscripciones where id=91');await db.query("insert into privado_en_vivo.cortes_reinicio values($1,'88',$2,'{\"1\":2,\"5\":1}')",[date,MASTER]);await as();await assert.rejects(call(),/Otro equipo/);await assert.rejects(call('88',MASTER),/Primero envía/);
 await as('postgres');await db.query("insert into public.en_vivo_envios values($1,'88',1,3,'[{\"cartones\":[99]}]')",[date]);await as();const next=(await call('88',MASTER)).rows[0].r;assert.deepEqual(next.winners.map(w=>w.ticket),['99']);
 }finally{await db.close();}
});
