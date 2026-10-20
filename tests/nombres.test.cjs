const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {PGlite}=require('@electric-sql/pglite');
test('los nombres se verifican, se guardan por fecha y sobreviven a Nuevo sorteo sin datos de pago',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create table public.ganadores(id int);alter table public.ganadores enable row level security;create policy public_read_ganadores on public.ganadores for select using(true);create table public.inscripciones(id int,nombre text,estado text,cartones bigint[],telefono text,pago_cedula text);insert into auth.users values('00000000-0000-0000-0000-000000000001');insert into public.inscripciones values(1,'Ana Prueba','aprobado',array[1,2],'NO PUBLICAR','NO PUBLICAR');`);
 for(const file of ['20261020020000_resultados_publicados.sql','20261020023556_nombres_publicos_ganadores.sql'])await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations',file),'utf8'));
 await db.exec(`insert into privado_resultados.publicadores_resultados(usuario_id) values('00000000-0000-0000-0000-000000000001');select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);`);
 const payload={version:1,fecha:'2026-10-19',grupos:[{tipo:'ronda',orden:1,ganadores:[{carton:1,premio_centimos:100}]},{tipo:'final',orden:2,ganadores:[{carton:2,premio_centimos:200}]}]};
 await db.query('select public.publicar_resultados_v1($1::jsonb)',[JSON.stringify(payload)]);await db.exec('delete from public.inscripciones');
 await db.exec('set role anon');const {rows}=await db.query('select resultado from public.resultados_publicos_con_nombres');assert.deepEqual(rows[0].resultado.nombres,{'1':'Ana Prueba','2':'Ana Prueba'});assert.ok(!JSON.stringify(rows).includes('NO PUBLICAR'));
 await assert.rejects(db.exec("insert into public.nombres_resultados_publicados values('2026-10-19',3,'Inventado')"),/permission denied/);
 await db.exec('reset role');await assert.rejects(db.exec('delete from public.nombres_resultados_publicados'),/permanentes/);
 assert.deepEqual((await db.query('select resultado from public.resultados_publicados')).rows[0].resultado,payload);
 }finally{await db.close()}
});
