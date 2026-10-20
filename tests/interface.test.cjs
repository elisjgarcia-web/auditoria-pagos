const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {JSDOM,VirtualConsole}=require('jsdom');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
test('DOM: vista previa, confirmación, datos cambiados, error, reintento e historial',async()=>{
 const calls=[];let saved=null,fail=false;
 const mock={auth:{getSession:async()=>({data:{session:{}}})},rpc:async(name,args)=>{calls.push({name,args});if(fail)return {error:{message:'Sin conexión'}};saved=args.p_resultado;return {data:{fecha:saved.fecha}}},from:()=>({select:()=>({order:()=>({limit:async()=>({data:saved?[{fecha:saved.fecha}]:[]})}),eq:()=>({single:async()=>({data:{resultado:saved}})})})})};
 const html=read('index.html').replace(/<script[^>]*src=[^>]*><\/script>/g,'');
 const console=new VirtualConsole();console.on('jsdomError',e=>{if(!e.message.includes('navigation'))throw e});
 const dom=new JSDOM(html,{virtualConsole:console,url:'https://local.test',runScripts:'dangerously',beforeParse(w){w.supabase={createClient:()=>mock};w.setTimeout=()=>0;w.alert=()=>{};w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};}});
 const w=dom.window;
 try{
 w.eval(read('publicacion.js'));w.eval(read('publicar-ganadores.js'));
 // Alimenta el índice por el método real de consulta, sin exponer datos personales al módulo público.
 mock.from=()=>({select:()=>({eq:()=>({range:async()=>({data:[{nombre:'Ana Prueba',cedula:'12345678',cartones:[1,2,3],estado:'aprobado'}]})})})});
 await w.supaCargar();w.document.getElementById('fechaSorteo').value='19/10/2026';w.document.getElementById('cant').value='5';w.crearRondas();
 const set=(id,value)=>w.document.getElementById(id).value=value;
 set('car1','1,2');set('pre1','100');set('car2','3');set('pre2','200');for(let i=3;i<=5;i++){set('car'+i,'1');set('pre'+i,'200')}
 mock.from=()=>({select:()=>({order:()=>({limit:async()=>({data:saved?[{fecha:saved.fecha}]:[]})}),eq:()=>({single:async()=>({data:{resultado:saved}})})})});
 await w.vistaPreviaGanadores();assert.equal(w.document.getElementById('dialogoPublicacion').open,true);assert.equal(calls.length,0);assert.ok(w.document.getElementById('vistaPublicacion').textContent.includes('Ana Prueba'));
 set('pre1','102');await w.confirmarGanadores();assert.match(w.document.getElementById('publicarEstado').textContent,/cambiaron/);assert.equal(calls.length,0);
 await w.vistaPreviaGanadores();fail=true;await w.confirmarGanadores();assert.match(w.document.getElementById('publicarEstado').textContent,/No se pudo publicar/);
 fail=false;await w.confirmarGanadores();assert.match(w.document.getElementById('publicarEstado').textContent,/Publicado y confirmado/);assert.equal(w.document.getElementById('dialogoPublicacion').open,false);
 assert.ok(!JSON.stringify(saved).includes('PRIVADO'));assert.equal(calls[1].name,'publicar_resultados_v1');
 await w.document.querySelector('#historialPublicaciones button').onclick();w.document.getElementById('buscarFechaPublicada').value='2026-10-19';await w.verFechaPublicada();assert.match(w.document.getElementById('resultadoHistorico').textContent,/Cartón lleno final/);
 const before=JSON.stringify(saved),count=calls.length;w.confirm=()=>true;await w.nuevoSorteo();assert.equal(JSON.stringify(saved),before);assert.equal(calls.length,count);
 }finally{w.close()}
});
