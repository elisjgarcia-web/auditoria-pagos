const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
test('migración, permisos, validación, reintentos y persistencia en PostgreSQL aislado',async()=>{
 const db=new PGlite();
 try{
 await db.exec(`create role anon;create role authenticated;create schema auth;
 create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table public.ganadores(id bigint primary key,nombre text,cedula text,telefono text);
 alter table public.ganadores enable row level security;
 grant select on public.ganadores to anon,authenticated;
 create policy public_read_ganadores on public.ganadores for select using(true);
 create table public.inscripciones(id int primary key,estado text,cartones bigint[]);
 insert into auth.users values ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');
 insert into public.inscripciones values(1,'aprobado',array[1,2,3]),(2,'pendiente',array[4]);`);
 await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261020020000_resultados_publicados.sql'),'utf8'));
 const payload={version:1,fecha:'2026-10-19',grupos:[{tipo:'ronda',orden:1,ganadores:[{carton:1,premio_centimos:1000}]},{tipo:'final',orden:2,ganadores:[{carton:2,premio_centimos:2000}]},{tipo:'consolacion',orden:0,ganadores:[{carton:3,premio_centimos:500}]},{tipo:'pozo',orden:0,ganadores:[{carton:2,premio_centimos:500}]}]};
 const publish=p=>db.query('select public.publicar_resultados_v1($1::jsonb) as r',[JSON.stringify(p)]);
 await assert.rejects(publish(payload),/autorizado/);
 await db.exec(`select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false)`);
 await assert.rejects(publish(payload),/autorizado/);
 await db.exec(`insert into privado_resultados.publicadores_resultados values('00000000-0000-0000-0000-000000000001',true);select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false)`);
 for(const change of [p=>p.nombre='PRIVADO',p=>p.grupos[0].cedula='123',p=>p.grupos[0].ganadores[0].telefono='PRIVADO',p=>p.grupos[0].ganadores[0].carton=4,p=>p.grupos[0].ganadores.push(p.grupos[0].ganadores[0]),p=>p.grupos[0].ganadores[0].premio_centimos=-1,p=>p.grupos[0].ganadores[0].premio_centimos=1.5,p=>p.grupos[0].tipo='NOMBRE LIBRE',p=>p.grupos.splice(1,1),p=>p.fecha='2026-02-30']){
  const bad=structuredClone(payload);change(bad);await assert.rejects(publish(bad));
 }
 await db.exec(`insert into public.inscripciones values(3,'aprobado',array[1])`);await assert.rejects(publish(payload),/única/);await db.exec('delete from public.inscripciones where id=3');
 const result=await publish(payload);assert.equal(result.rows[0].r.ya_publicado,false);
 assert.equal((await publish(payload)).rows[0].r.ya_publicado,true);
 const altered=structuredClone(payload);altered.grupos[0].ganadores[0].premio_centimos=2000;await assert.rejects(publish(altered),/diferentes/);
 await db.exec('delete from public.inscripciones');assert.equal((await publish(payload)).rows[0].r.ya_publicado,true);
 assert.equal((await db.query('select count(*)::int as n from public.resultados_publicados')).rows[0].n,1);
 for(const sql of ['delete from public.resultados_publicados','update public.resultados_publicados set publicado_en=now()','truncate public.resultados_publicados'])await assert.rejects(db.exec(sql),/permanentes/);
 await db.exec('set role anon');await assert.rejects(db.exec('select * from public.ganadores'),/permission denied/);assert.equal((await db.query('select * from public.resultados_publicados')).rows.length,1);
 await assert.rejects(publish(payload),/permission denied/);await assert.rejects(db.exec('select * from privado_resultados.publicadores_resultados'),/permission denied/);
 await assert.rejects(db.query('insert into public.resultados_publicados(fecha,resultado) values($1,$2)',['2026-10-20',payload]),/permission denied/);
 await db.exec('reset role; set role authenticated');
 await assert.rejects(db.exec('delete from public.resultados_publicados'),/permission denied/);
 await assert.rejects(db.exec('select * from privado_resultados.publicadores_resultados'),/permission denied/);
 // Desactivar al operador también bloquea sus reintentos.
 await db.exec('reset role;update privado_resultados.publicadores_resultados set activo=false');await assert.rejects(publish(payload),/autorizado/);
 }finally{await db.close()}
});
