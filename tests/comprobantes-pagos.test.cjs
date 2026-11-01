const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM,VirtualConsole}=require('jsdom');const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const tick=async()=>{for(let i=0;i<6;i++)await new Promise(r=>setImmediate(r));};
function mockDB(map){const db={createObjectStore(){},transaction(){const tx={objectStore(){const request=fn=>{const r={};queueMicrotask(()=>{r.result=fn();r.onsuccess?.();tx.oncomplete?.();});return r;};return {get:k=>request(()=>map.get(k)),put:v=>request(()=>map.set(v.key,v)),clear:()=>request(()=>map.clear())};}};return tx;}};return {open(){const r={};queueMicrotask(()=>{r.result=db;r.onupgradeneeded?.();r.onsuccess?.();});return r;}};}
function setup(map=new Map()){
 const calls=[],shares=[],copies=[];let clipError=false;
 const dom=new JSDOM(read('index.html').replace(/<script[^>]*src=[^>]*><\/script>/g,''),{runScripts:'dangerously',url:'https://local.test',virtualConsole:new VirtualConsole(),beforeParse(w){
  w.supabase={createClient:()=>({})};w.setTimeout=()=>0;w.alert=()=>{};w.confirm=()=>true;w.indexedDB=mockDB(map);w.URL.createObjectURL=()=> 'blob:test';w.URL.revokeObjectURL=()=>{};
  w.Image=class {width=1000;height=1600;set src(v){queueMicrotask(()=>this.onload());}};
  w.HTMLCanvasElement.prototype.getContext=function(){const c=this;return new Proxy({measureText:t=>({width:String(t).length*14}),getImageData:()=>({data:new Uint8ClampedArray(c.width*c.height*4).fill(255)})},{get(o,k){return k in o?o[k]:(...args)=>calls.push({k,args});},set(o,k,v){o[k]=v;return true;}});};
  w.HTMLCanvasElement.prototype.toBlob=function(cb){queueMicrotask(()=>cb(new w.Blob(['raster'],{type:'image/png'})));};
  w.HTMLCanvasElement.prototype.getBoundingClientRect=()=>({left:0,top:0,width:100,height:200});
  Object.defineProperty(w.navigator,'clipboard',{value:{read:async()=>{if(clipError)throw Error('denied');return [{types:['image/png'],getType:async()=>new w.Blob(['capture'],{type:'image/png'})}];},writeText:async s=>copies.push(s)}});
  w.navigator.canShare=()=>true;w.navigator.share=async args=>shares.push(args);
 }});dom.window.eval(read('comprobantes-pagos.js'));return {dom,w:dom.window,calls,shares,copies,map,denyClipboard(){clipError=true;}};
}
function pagos(){return ['Ana Ejemplo','Luis Ejemplo','Rosa Ejemplo'].map((nombre,i)=>({nombre,carton:i+1,monto:100,x:{nombre,telefono:'04121234567',cedula:String(12345678+i),cedulaCompra:String(12345678+i),telefonoRegistro:'04121234567',bancoCodigo:'0102'}}));}
async function attach(w,wrap){await wrap.querySelector('.recibo-acciones button').onclick();await tick();const c=wrap.querySelector('canvas');c.onpointerdown(new w.MouseEvent('pointerdown',{clientX:8,clientY:110}));c.onpointerdown(new w.MouseEvent('pointerdown',{clientX:8,clientY:130}));await tick();}
test('capturas por ganador, collage completo, aislamiento por ronda y datos copiados intactos',async()=>{
 const t=setup(),{w}=t;
 try{w.document.getElementById('fechaSorteo').value='31/10/2026';w.document.getElementById('nom1').value='Ronda 1';w.crearBotonesPago('pagosBtns1',pagos(),'ok1');const cont=w.document.getElementById('pagosBtns1'),wraps=[...cont.querySelectorAll('.recibo-pago')],group=cont.querySelector('.recibo-grupo button');assert.equal(wraps.length,3);assert.equal(group.disabled,true);
  for(let i=0;i<3;i++){assert.equal(wraps[i].querySelectorAll('button').length,2);await attach(w,wraps[i]);assert.equal(group.disabled,i!==2);}
  assert.equal(t.map.size,3);assert.ok(t.calls.some(c=>c.k==='fillText'&&c.args[0]==='Cartón 1 · Ronda 1'));assert.ok(t.calls.some(c=>c.k==='fillText'&&c.args[0]==='🎉 Ana Ejemplo'));assert.ok(t.calls.some(c=>c.k==='fillText'&&c.args[0]==='🎉 Rosa Ejemplo'));
  await wraps[1].querySelectorAll('button')[1].onclick();assert.equal(t.shares.length,1);assert.equal(t.shares[0].files[0].name,'premio-2.png');
  const before=t.calls.length;await group.onclick();assert.equal(t.shares.length,2);assert.equal(t.shares[1].files[0].name,'comprobantes-pagosBtns1.png');assert.equal(t.calls.slice(before).filter(c=>c.k==='drawImage').length,6); // 3 originales procesados + 3 celdas completas.
  await cont.querySelector('button.copy').onclick();assert.equal(t.copies[0],[w.fmt(100),'04121234567','12345678','0102'].join('\n'));
  w.crearBotonesPago('pagosBtns2',pagos(),'ok2');assert.equal(w.document.querySelectorAll('#pagosBtns2 .recibo-pago').length,3);assert.equal(w.document.querySelector('#pagosBtns2 .recibo-grupo button').disabled,true);
  assert(!JSON.stringify(w.capturarPagosCompartidos()).includes('blob'));assert.equal(w.document.querySelector('[data-clave-pago]'),null);
 }finally{w.close();}
});
test('recupera capturas locales al regenerar y recargar; fecha y monto distintos no reutilizan comprobantes',async()=>{
 const map=new Map(),t=setup(map);try{t.w.document.getElementById('fechaSorteo').value='31/10/2026';t.w.crearBotonesPago('pagosBtns1',[pagos()[0]],'ok1');await attach(t.w,t.w.document.querySelector('.recibo-pago'));assert.equal(map.size,1);t.w.crearBotonesPago('pagosBtns1',[pagos()[0]],'ok1');await tick();assert.equal(t.w.document.querySelector('.recibo-acciones button:nth-child(2)').disabled,false);}finally{t.w.close();}
 const r=setup(map);try{r.w.document.getElementById('fechaSorteo').value='31/10/2026';r.w.crearBotonesPago('pagosBtns1',[pagos()[0]],'ok1');await tick();assert.equal(r.w.document.querySelector('.recibo-acciones button:nth-child(2)').disabled,false);
 r.w.crearBotonesPago('pagosBtns1',[{...pagos()[0],monto:200}],'ok1');await tick();assert.equal(r.w.document.querySelector('.recibo-acciones button:nth-child(2)').disabled,true);
 r.w.document.getElementById('fechaSorteo').value='01/11/2026';r.w.crearBotonesPago('pagosBtns1',[pagos()[0]],'ok1');await tick();assert.equal(r.w.document.querySelector('.recibo-acciones button:nth-child(2)').disabled,true);await r.w.ComprobantesPagos.limpiar();assert.equal(map.size,0);
 }finally{r.w.close();}
});
test('sin acceso a pegar abre selección de fotos; Top también tiene sus dos botones y collage',async()=>{
 const t=setup();try{t.w.renderPagosTop(pagos().map(p=>({...p,carton:'TOP '+p.carton,lista:[p.x]})));const cont=t.w.document.getElementById('pagosBtnsTop');assert.equal(cont.querySelectorAll('.recibo-pago').length,3);assert.ok(cont.querySelector('.recibo-grupo button'));t.denyClipboard();let opened=0;cont.querySelector('input[type=file]').click=()=>{opened++;};await cont.querySelector('.recibo-acciones button').onclick();assert.equal(opened,1);assert.match(cont.querySelector('.recibo-estado').textContent,/Selecciona la captura/);}finally{t.w.close();}
});
