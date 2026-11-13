const{test}=require('node:test'),assert=require('node:assert/strict'),{PGlite}=require('@electric-sql/pglite'),fs=require('node:fs'),path=require('node:path');
test('nombre solo para personal autorizado y aprobados del sorteo; duplicados se advierten, sin datos bancarios ni escrituras',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create schema auth;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 grant usage on schema auth to authenticated;create schema privado_en_vivo;grant usage on schema privado_en_vivo to authenticated;
 create function privado_en_vivo.puede_enviar() returns boolean language sql as $$select auth.uid()='00000000-0000-0000-0000-000000000002'::uuid$$;
 create table public.inscripciones(id bigint,nombre text,estado text,cartones bigint[],telefono text,pago_cedula text);
 create function privado_en_vivo.source_actual() returns text language sql as $$select min(id)::text from public.inscripciones$$;
 create table public.en_vivo_jornadas(fecha date,source text);
 insert into public.en_vivo_jornadas values('2026-11-13','88');
 insert into public.inscripciones values(88,'Ana Ejemplo','aprobado',array[75,99],'PRIVADO','PRIVADO'),(89,'Pendiente','pendiente',array[100],'PRIVADO','PRIVADO'),(90,'Duplicado','aprobado',array[99],'PRIVADO','PRIVADO');`);
 await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/presentadora-ganadores.sql'),'utf8'));
 const call=(source='88',ns=[75,99,100])=>db.query("select public.en_vivo_identificar_cartones('2026-11-13',$1,$2::integer[]) r",[source,ns]);
 await db.exec('set role anon');await assert.rejects(call(),/permission denied/);
 await db.exec("reset role;set role authenticated");await assert.rejects(call(),/autorizado/);
 await db.exec("reset role;set test.uid='00000000-0000-0000-0000-000000000002';set role authenticated");
 const r=(await call()).rows[0].r;assert.deepEqual(r.ganadores,[{carton:75,nombre:'Ana Ejemplo',estado:'aprobado'},{carton:99,nombre:null,estado:'ambiguo'},{carton:100,nombre:null,estado:'no_encontrado'}]);assert.ok(!JSON.stringify(r).includes('PRIVADO'));
 await assert.rejects(call('viejo'),/sorteo cambió/);await assert.rejects(call('88',[75,75]),/Revisa/);await assert.rejects(call('88',[0]),/Revisa/);
 await db.exec('reset role');assert.equal((await db.query('select count(*) n from public.inscripciones')).rows[0].n,3);
 }finally{await db.close();}
});
