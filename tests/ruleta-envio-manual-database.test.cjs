const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
test('payments reads only explicitly submitted draws, keeps later draws pending and rejects unauthorized access',async()=>{
 const db=new PGlite();try{
 await db.exec(`create schema privado_en_vivo;
 create function privado_en_vivo.es_pagos() returns boolean language sql as $$select coalesce(current_setting('test.autorizado',true),'')='si'$$;
 create table public.inscripciones(id bigint);
 create table public.slot_premios_sesiones(id uuid,created_at timestamptz,source_anchor text,state jsonb);
 insert into public.inscripciones values(88);
 insert into public.slot_premios_sesiones values('10000000-0000-4000-8000-000000000001',now(),'88','{"winners":[{"drawId":"a","ticket":"75","prize":"10 USD","date":"2026-11-04T23:00:00Z"},{"drawId":"b","ticket":"76","prize":"10 USD","date":"2026-11-04T23:01:00Z"}]}');`);
 await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/ruleta-entrega-manual.sql'),'utf8'));
 await assert.rejects(db.query('select public.pagos_ruleta_consolacion()'),/no autorizado/);
 await db.exec("set test.autorizado='si'");
 const read=async()=> (await db.query('select public.pagos_ruleta_consolacion() as r')).rows[0].r;
 assert.equal((await read()).winners.length,0);
 await db.exec(`update public.slot_premios_sesiones set state=jsonb_set(state,'{paymentSubmission}','{"drawIds":["a"],"sentAt":"2026-11-04T23:02:00Z"}');`);
 assert.deepEqual((await read()).winners.map(w=>w.drawId),['a']);
 await db.exec(`update public.slot_premios_sesiones set state=jsonb_set(state,'{paymentSubmission,drawIds}','["a","b"]');`);
 assert.deepEqual((await read()).winners.map(w=>w.drawId),['a','b']);
 assert.equal((await read()).winners.length,2);
 await db.exec('delete from public.inscripciones; insert into public.inscripciones values(99)');
 assert.equal((await read()).winners.length,0);
 }finally{await db.close();}
});
