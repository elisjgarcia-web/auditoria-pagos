const{test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const{crear}=require('../presentadora/ganadores.js');
const ctx={fecha:'2026-11-13',source:'88',maestroId:null};
test('consulta únicamente los cartones pedidos y sus nombres, reutiliza lectura, invalida por sorteo, reinicio y tiempo',async()=>{
 let calls=0,time=1;const lector=crear({ahora:()=>time,rpc:async(name,a)=>{calls++;assert.equal(name,'en_vivo_identificar_cartones');return{fecha:a.p_fecha,source:a.p_source,ganadores:a.p_cartones.map(carton=>({carton,nombre:'Ana Ejemplo',estado:'aprobado'}))};}});
 assert.deepEqual(await lector.consultar(ctx,[75]),[{carton:75,nombre:'Ana Ejemplo',estado:'aprobado'}]);await lector.consultar(ctx,[75]);assert.equal(calls,1);
 await lector.consultar({...ctx,source:'89'},[75]);await lector.consultar({...ctx,maestroId:'nuevo'},[75]);assert.equal(calls,3);
 time=31000;await lector.consultar(ctx,[75]);assert.equal(calls,4);await assert.rejects(lector.consultar(ctx,[75,75]),/Revisa/);
});
test('consulta simultánea se comparte; respuestas ajenas y fallos no quedan en caché',async()=>{
 let calls=0,resolve;const lector=crear({rpc:async()=>{calls++;return new Promise(r=>resolve=r);}});
 const a=lector.consultar(ctx,[75]),b=lector.consultar(ctx,[75]);assert.equal(calls,1);resolve({fecha:ctx.fecha,source:'otro',ganadores:[]});await assert.rejects(a,/confirmar/);await assert.rejects(b,/confirmar/);
 const c=lector.consultar(ctx,[75]);assert.equal(calls,2);resolve({fecha:ctx.fecha,source:'88',ganadores:[{carton:75,nombre:null,estado:'no_encontrado'}]});assert.equal((await c)[0].estado,'no_encontrado');
});
function renderer(){
 const dom=new JSDOM('<div id="destino"></div>',{runScripts:'outside-only'}),w=dom.window,src=fs.readFileSync(path.join(__dirname,'../presentadora/app.js'),'utf8');
 const timers=[],requests=[];w.setTimeout=fn=>{timers.push(fn);return timers.length;};w.clearTimeout=()=>{};
 w.PresentadoraGanadores= {crear:()=>({consultar:()=>new Promise(resolve=>requests.push(resolve))})};
 w.EnVivoComun=require('../rondas-en-vivo-comun.js');
 const begin=src.indexOf('const nombresGanadores='),end=src.indexOf('function paint(){',begin);
 w.eval("var config={fecha:'2026-11-13',source:'88'},card={numeros:'75'},draft={cards:[card]},C=window.EnVivoComun;function rpc(){}function node(tag,t){const n=document.createElement(tag);n.textContent=t;return n;}"+src.slice(begin,end));
 return{w,timers,requests,el:w.document.getElementById('destino'),call:()=>w.eval("mostrarGanador(card,document.getElementById('destino'))"),flush:async()=>{await new Promise(r=>setImmediate(r));},close:()=>w.close()};
}
test('los nombres se muestran como texto y una respuesta tardía no reemplaza la corrección manual',async()=>{
 const t=renderer();try{
 t.call();t.timers.shift()();t.w.card.numeros='99';t.call();t.timers.shift()();
 t.requests[0]([{carton:75,estado:'aprobado',nombre:'Nombre anterior'}]);await t.flush();assert.doesNotMatch(t.el.textContent,/Nombre anterior/);
 t.requests[1]([{carton:99,estado:'aprobado',nombre:'<img src=x onerror=alert(1)>'}]);await t.flush();assert.match(t.el.textContent,/Cartón 99/);assert.equal(t.el.querySelector('img'),null);
 t.w.config={fecha:'2026-11-14',source:'89'};t.call();t.timers.shift()();t.w.draft={cards:[]};t.requests[2]([{carton:99,estado:'aprobado',nombre:'Otro sorteo'}]);await t.flush();assert.doesNotMatch(t.el.textContent,/Otro sorteo/);
 }finally{t.close();}
});
