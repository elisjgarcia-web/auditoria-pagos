const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require('jsdom'),{PGlite}=require('@electric-sql/pglite');
const T=require('../shared/youtube.js');
test('normaliza enlaces YouTube y rechaza canales, dominios falsos y contenido ejecutable',()=>{
 for(const url of ['https://youtu.be/Abcd_123-xy?si=abc&t=10','https://www.youtube.com/watch?v=Abcd_123-xy&t=40','https://youtube.com/live/Abcd_123-xy','https://m.youtube.com/embed/Abcd_123-xy'])assert.deepEqual(T.parse(url),{id:'Abcd_123-xy',url:'https://www.youtube.com/watch?v=Abcd_123-xy'});
 for(const url of ['javascript:alert(1)','https://youtube.com.evil.test/watch?v=Abcd_123-xy','https://youtu.be@evil.test/Abcd_123-xy','https://youtube.com/@canal','https://youtube.com/playlist?list=x','http://youtu.be/Abcd_123-xy','https://youtu.be/short','https://youtu.be:444/Abcd_123-xy','https://youtu.be/Abcd_123-xy/extra'])assert.throws(()=>T.parse(url));
});
test('Postgres aislado: permisos reales, expiración, revisión y bloqueo de escritura directa',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create schema privado_resultados;grant usage on schema privado_resultados to authenticated;create table privado_resultados.publicadores_resultados(usuario_id uuid primary key,activo boolean);revoke all on privado_resultados.publicadores_resultados from public,anon,authenticated;insert into privado_resultados.publicadores_resultados values('00000000-0000-0000-0000-000000000001',true);`);
 await db.exec(fs.readFileSync('supabase/transmision-juego.sql','utf8'));
 const save=(id,rev)=>db.query('select public.guardar_transmision_juego_v1($1,$2) r',[id,rev]);
 await assert.rejects(save('Abcd_123-xy',0),/autorizado/);
 await db.exec(`set role anon`);assert.equal((await db.query('select video_id from public.transmision_juego')).rows[0].video_id,null);await assert.rejects(save('Abcd_123-xy',0),/permission denied/);
 await db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false)`);await assert.rejects(save('Abcd_123-xy',0),/autorizado/);
 await db.exec(`select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false)`);
 for(const [id,rev] of [['<script>',0],['https://youtube.com',0],['Abcd_123-xy',null],['Abcd_123-xy',-1]])await assert.rejects(save(id,rev));
 let r=(await save('Abcd_123-xy',0)).rows[0].r;assert.equal(r.revision,1);assert.equal(r.video_id,'Abcd_123-xy');assert.ok(Date.parse(r.expira_en)>Date.now()+17*3600000);
 await assert.rejects(save('Abcd_123-xy',0),/cambió/);
 for(const sql of ["update public.transmision_juego set video_id=null,expira_en=null",'delete from public.transmision_juego','truncate public.transmision_juego','insert into public.transmision_juego(id) values(2)'])await assert.rejects(db.exec(sql),/permission denied/);
 r=(await save('ZyXw_123-xy',1)).rows[0].r;assert.equal(r.revision,2);
 r=(await save(null,2)).rows[0].r;assert.equal(r.video_id,null);assert.equal(r.expira_en,null);assert.equal(r.revision,3);
 await db.exec('reset role;update privado_resultados.publicadores_resultados set activo=false;set role authenticated');await assert.rejects(save('Abcd_123-xy',3),/autorizado/);
 const checks=await db.query("select prosecdef,proconfig from pg_proc where proname='guardar_transmision_juego_v1' and pronamespace='public'::regnamespace");assert.equal(checks.rows[0].prosecdef,false);
 }finally{await db.close()}
});
async function admin(opts={}){
 const dom=new JSDOM(fs.readFileSync('index.html','utf8'),{url:'https://pagos.test',runScripts:'outside-only'}),w=dom.window;
 const calls=[];let row={video_id:null,revision:0,expira_en:null},resolve;
 w.confirm=()=>true;w.supa={auth:{getSession:async()=>({data:{session:opts.noSession?null:{user:{id:'u'}}}})},from:()=>({select:()=>({eq:()=>({single:async()=>({data:row,error:opts.readError})})})}),rpc:async(name,args)=>{calls.push({name,args});if(opts.pending)await new Promise(r=>resolve=r);if(opts.rpcError)return{error:{message:'error'}};row={video_id:args.p_video_id,revision:args.p_revision+1,expira_en:args.p_video_id?new Date(Date.now()+3600000).toISOString():null};return {data:row};}};
 w.eval(fs.readFileSync('shared/youtube.js','utf8'));w.eval(fs.readFileSync('transmision.js','utf8'));await new Promise(r=>setTimeout(r,0));
 return {w,calls,finish:()=>resolve?.(),el:id=>w.document.getElementById(id),settle:()=>new Promise(r=>setTimeout(r,0)),close:()=>w.close()};
}
test('app de pagos: enviar/cambiar/quitar confirmados con revisión, sin tocar pagos',async()=>{const a=await admin();try{
 a.el('transmisionEnlace').value='https://youtu.be/Abcd_123-xy?t=50';a.el('transmisionEnviar').click();await a.settle();assert.equal(a.calls[0].args.p_video_id,'Abcd_123-xy');assert.equal(a.calls[0].args.p_revision,0);assert.match(a.el('transmisionEstado').textContent,/enviada/);
 a.el('transmisionEnlace').value='https://youtube.com/live/ZyXw_123-xy';a.el('transmisionEnviar').click();await a.settle();assert.equal(a.calls[1].args.p_revision,1);
 a.el('transmisionQuitar').click();await a.settle();assert.equal(a.calls[2].args.p_video_id,null);assert.equal(a.calls[2].args.p_revision,2);
 assert.ok(a.calls.every(c=>c.name==='guardar_transmision_juego_v1'));
 }finally{a.close()}});
test('app de pagos: enlaces inválidos, sin sesión, fallo de lectura/escritura y doble toque',async()=>{
 for(const opts of [{},{noSession:true},{readError:{message:'offline'}},{rpcError:true}]){const a=await admin(opts);try{
 a.el('transmisionEnlace').value='https://evil.test/x';a.el('transmisionEnviar').click();await a.settle();assert.equal(a.calls.length,0);
 a.el('transmisionEnlace').value='https://youtu.be/Abcd_123-xy';a.el('transmisionEnviar').click();await a.settle();if(opts.noSession||opts.readError)assert.equal(a.calls.length,0);if(opts.rpcError){assert.equal(a.el('transmisionEnviar').disabled,true);assert.match(a.el('transmisionEstado').textContent,/No se confirmó/);}
 }finally{a.close()}}
 const a=await admin({pending:true});try{a.el('transmisionEnlace').value='https://youtu.be/Abcd_123-xy';a.el('transmisionEnviar').click();a.el('transmisionEnviar').click();await a.settle();assert.equal(a.calls.length,1);a.finish();await a.settle();}finally{a.close()}
});
test('app: consultar conserva enlace que se está editando',async()=>{const a=await admin();try{a.el('transmisionEnlace').value='https://youtu.be/ZyXw_123-xy';a.el('transmisionEnlace').dispatchEvent(new a.w.Event('input'));a.el('transmisionConsultar').click();await a.settle();assert.equal(a.el('transmisionEnlace').value,'https://youtu.be/ZyXw_123-xy')}finally{a.close()}});
test('copiar anuncio incluye todo el mensaje y el enlace recién pegado, sin envíos remotos',async()=>{
 const a=await admin();try{
  const copied=[];Object.defineProperty(a.w.navigator,'clipboard',{value:{writeText:async text=>copied.push(text)},configurable:true});
  const link='https://www.youtube.com/live/Abcd_123-xy?si=mi-enlace';a.el('transmisionEnlace').value=link;
  a.el('transmisionCopiar').click();await a.settle();
  assert.equal(copied[0],'🔴🎱 ¡YA ESTAMOS EN VIVO, FAMILIA BINGUERA!\n\nÚnete a la transmisión de *Bingo Andino 75* y disfruta cada ronda con nosotros. 🥳✨\n\n👇 Toca el enlace para entrar:\n'+link+'\n\n🍀 ¡Mucha suerte para todos!');
  a.el('transmisionEnlace').value='https://youtu.be/ZyXw_123-xy';a.el('transmisionCopiar').click();await a.settle();assert.ok(copied[1].includes('https://youtu.be/ZyXw_123-xy'));assert.ok(!copied[1].includes(link));assert.equal(a.calls.length,0);assert.equal(a.el('transmisionAnuncio').hidden,true);
 }finally{a.close()}
});
test('copiar rechaza enlace vacío o falso, y ofrece anuncio seleccionable si el portapapeles falla',async()=>{
 const a=await admin({readError:{message:'offline'}});try{
  const copied=[];Object.defineProperty(a.w.navigator,'clipboard',{value:{writeText:async text=>{copied.push(text);throw Error('denegado')}},configurable:true});
  for(const value of ['', 'https://youtube.com.ejemplo.test/watch?v=Abcd_123-xy']){a.el('transmisionEnlace').value=value;a.el('transmisionCopiar').click();await a.settle();assert.equal(copied.length,0);}
  a.el('transmisionEnlace').value='https://youtu.be/Abcd_123-xy';a.el('transmisionCopiar').click();await a.settle();assert.equal(a.el('transmisionAnuncio').hidden,false);assert.ok(a.el('transmisionAnuncio').value.includes('¡Mucha suerte para todos!'));assert.equal(a.el('transmisionAnuncio').selectionEnd,a.el('transmisionAnuncio').value.length);assert.equal(a.el('transmisionCopiar').disabled,false);assert.equal(a.calls.length,0);
 }finally{a.close()}
});
