const {test}=require('node:test'),assert=require('node:assert/strict'),{PGlite}=require('@electric-sql/pglite'),fs=require('node:fs'),path=require('node:path');
test('link lookup is authorized, scoped to current draw/date, independent of captures, and respects reset cutoff',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create schema privado_en_vivo;
 create function privado_en_vivo.es_pagos() returns boolean language sql as $$select coalesce(current_setting('test.pagos',true),'')='si'$$;
 create function privado_en_vivo.source_actual() returns text language sql as $$select '88'::text$$;
 create table public.en_vivo_jornadas(fecha date,source text,youtube text,youtube_actualizado_en timestamptz);
 create table privado_en_vivo.cortes_reinicio(fecha date,source text,registrado_en timestamptz);
 insert into public.en_vivo_jornadas values('2026-11-05','old','https://www.youtube.com/watch?v=Oldd_123-xy','2026-11-05T23:00:00Z');`);
 await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/presentadora-enlace-recibir.sql'),'utf8'));
 await db.exec('set role anon');await assert.rejects(db.query("select public.en_vivo_enlace_recibir('2026-11-05')"),/permission denied/);
 await db.exec('reset role;set role authenticated');await assert.rejects(db.query("select public.en_vivo_enlace_recibir('2026-11-05')"),/no autorizado/);
 await db.exec("set test.pagos='si'");
 const read=async()=> (await db.query("select public.en_vivo_enlace_recibir('2026-11-05') as r")).rows[0].r;
 assert.equal((await read()).youtube,null);assert.equal((await read()).source,'88');
 await db.exec("reset role;insert into public.en_vivo_jornadas values('2026-11-05','88','https://www.youtube.com/watch?v=Abcd_123-xy','2026-11-05T23:00:00Z');set role authenticated");
 assert.match((await read()).youtube,/Abcd_123-xy/);
 await db.exec("reset role;insert into privado_en_vivo.cortes_reinicio values('2026-11-05','88','2026-11-05T23:01:00Z');set role authenticated");assert.equal((await read()).youtube,null);
 await db.exec("reset role;update public.en_vivo_jornadas set youtube_actualizado_en='2026-11-05T23:02:00Z' where source='88';set role authenticated");assert.match((await read()).youtube,/Abcd_123-xy/);
 }finally{await db.close();}
});
