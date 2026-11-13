const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM,VirtualConsole}=require('jsdom');const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const tick=async()=>{for(let i=0;i<6;i++)await new Promise(r=>setImmediate(r));};
function mockDB(map){const db={objectStoreNames:{contains:()=>true},close(){},createObjectStore(){},transaction(){const tx={objectStore(){const request=fn=>{const r={};queueMicrotask(()=>{r.result=fn();r.onsuccess?.();tx.oncomplete?.();});return r;};return {get:k=>request(()=>map.get(k)),put:v=>request(()=>map.set(v.key,v)),clear:()=>request(()=>map.clear())};}};return tx;}};return {open(){const r={};queueMicrotask(()=>{r.result=db;r.onupgradeneeded?.();r.onsuccess?.();});return r;}};}
function setup(map=new Map()){
 const calls=[],shares=[],copies=[];let clipError=false;
 const dom=new JSDOM(read('index.html').replace(/<script[^>]*src=[^>]*><\/script>/g,''),{runScripts:'dangerously',url:'https://local.test',virtualConsole:new VirtualConsole(),beforeParse(w){
  w.supabase={createClient:()=>({})};w.setTimeout=()=>0;w.alert=()=>{};w.confirm=()=>true;w.indexedDB=mockDB(map);w.URL.createObjectURL=()=> 'blob:test';w.URL.revokeObjectURL=()=>{};
  w.Image=class {width=1000;height=1600;set src(v){queueMicrotask(()=>this.onload());}};
  w.HTMLCanvasElement.prototype.getContext=function(){const c=this;return new Proxy({measureText:t=>({width:String(t).length*14}),getImageData:()=>({data:new Uint8ClampedArray(c.width*c.height*4).fill(255)})},{get(o,k){return k in o?o[k]:(...args)=>calls.push({k,args});},set(o,k,v){o[k]=v;return true;}});};
  w.HTMLCanvasElement.prototype.toBlob=function(cb,type='image/png'){queueMicrotask(()=>cb(new w.Blob(['raster'],{type})));};
  w.HTMLCanvasElement.prototype.getBoundingClientRect=()=>({left:0,top:0,width:100,height:200});
  Object.defineProperty(w.navigator,'clipboard',{value:{read:async()=>{if(clipError)throw Error('denied');return [{types:['image/png'],getType:async()=>new w.Blob(['capture'],{type:'image/png'})}];},writeText:async s=>copies.push(s)}});
  w.navigator.canShare=()=>true;w.navigator.share=async args=>shares.push(args);
 }});dom.window.eval(read('comprobantes-pagos.js'));return {dom,w:dom.window,calls,shares,copies,map,denyClipboard(){clipError=true;}};
}
function pagos(){return ['Ana Ejemplo','Luis Ejemplo','Rosa Ejemplo'].map((nombre,i)=>({nombre,carton:i+1,monto:100,x:{nombre,telefono:'04121234567',cedula:String(12345678+i),cedulaCompra:String(12345678+i),telefonoRegistro:'04121234567',bancoCodigo:'0102'}}));}
async function attach(w,wrap){await wrap.querySelector('.recibo-pegar-pago').onclick();await tick();const c=wrap.querySelector('.recibo-pago-vista');if(!c.classList.contains('cp-editando'))wrap.querySelector('.cp-zoom-pago').click();c.onpointerdown(new w.MouseEvent('pointerdown',{clientX:8,clientY:110}));c.onpointerdown(new w.MouseEvent('pointerdown',{clientX:8,clientY:130}));await tick();}
test('capturas por ganador, collage completo, aislamiento por ronda y datos copiados intactos',async()=>{
 const t=setup(),{w}=t;
 try{w.document.getElementById('fechaSorteo').value='31/10/2026';w.document.getElementById('nom1').value='Ronda 1';w.crearBotonesPago('pagosBtns1',pagos(),'ok1');const cont=w.document.getElementById('pagosBtns1'),wraps=[...cont.querySelectorAll('.recibo-pago')],group=cont.querySelector('.recibo-grupo button');assert.equal(wraps.length,3);assert.equal(group.disabled,true);
  for(let i=0;i<3;i++){assert.ok(wraps[i].querySelector('.cp-zoom-pago'));assert.ok(wraps[i].querySelector('.recibo-pegar-resultado'));assert.ok(wraps[i].querySelector('.recibo-pegar-pago'));assert.ok(wraps[i].querySelector('.recibo-compartir'));await attach(w,wraps[i]);assert.equal(group.disabled,i!==2);}
  assert.equal(t.map.size,3);assert.ok(t.calls.some(c=>c.k==='fillText'&&c.args[0]==='Cartón 1 · Ronda 1'));assert.ok(t.calls.some(c=>c.k==='fillText'&&c.args[0]==='🎉 Ana Ejemplo'));assert.ok(t.calls.some(c=>c.k==='fillText'&&c.args[0]==='🎉 Rosa Ejemplo'));
  await wraps[1].querySelector('.recibo-compartir').onclick();assert.equal(t.shares.length,1);assert.equal(t.shares[0].files[0].name,'premio-2.png');
  const before=t.calls.length;await group.onclick();assert.equal(t.shares.length,2);assert.equal(t.shares[1].files[0].name,'comprobantes-pagosBtns1.png');assert.equal(t.calls.slice(before).filter(c=>c.k==='drawImage').length,6); // 3 originales procesados + 3 celdas completas.
  await cont.querySelector('button.copy').onclick();assert.equal(t.copies[0],[w.fmt(100),'04121234567','12345678','0102'].join('\n'));
  w.crearBotonesPago('pagosBtns2',pagos(),'ok2');assert.equal(w.document.querySelectorAll('#pagosBtns2 .recibo-pago').length,3);assert.equal(w.document.querySelector('#pagosBtns2 .recibo-grupo button').disabled,true);
  assert(!JSON.stringify(w.capturarPagosCompartidos()).includes('blob'));assert.equal(w.document.querySelector('[data-clave-pago]'),null);
 }finally{w.close();}
});
test('recupera capturas locales al regenerar y recargar; fecha y monto distintos no reutilizan comprobantes',async()=>{
 const map=new Map(),t=setup(map);try{t.w.document.getElementById('fechaSorteo').value='31/10/2026';t.w.crearBotonesPago('pagosBtns1',[pagos()[0]],'ok1');await attach(t.w,t.w.document.querySelector('.recibo-pago'));assert.equal(map.size,1);t.w.crearBotonesPago('pagosBtns1',[pagos()[0]],'ok1');await tick();assert.equal(t.w.document.querySelector('.recibo-compartir').disabled,false);}finally{t.w.close();}
 const r=setup(map);try{r.w.document.getElementById('fechaSorteo').value='31/10/2026';r.w.crearBotonesPago('pagosBtns1',[pagos()[0]],'ok1');await tick();assert.equal(r.w.document.querySelector('.recibo-compartir').disabled,false);
 r.w.crearBotonesPago('pagosBtns1',[{...pagos()[0],monto:200}],'ok1');await tick();assert.equal(r.w.document.querySelector('.recibo-compartir').disabled,true);
 r.w.document.getElementById('fechaSorteo').value='01/11/2026';r.w.crearBotonesPago('pagosBtns1',[pagos()[0]],'ok1');await tick();assert.equal(r.w.document.querySelector('.recibo-compartir').disabled,true);await r.w.ComprobantesPagos.limpiar();assert.equal(map.size,0);
 }finally{r.w.close();}
});
test('sin acceso a pegar abre selección de fotos; Top también tiene pegado por tipo y collage',async()=>{
 const t=setup();try{t.w.renderPagosTop(pagos().map(p=>({...p,carton:'TOP '+p.carton,lista:[p.x]})));const cont=t.w.document.getElementById('pagosBtnsTop');assert.equal(cont.querySelectorAll('.recibo-pago').length,3);assert.ok(cont.querySelector('.recibo-grupo button'));t.denyClipboard();let opened=0;cont.querySelector('.recibo-pago-input').click=()=>{opened++;};await cont.querySelector('.recibo-pegar-pago').onclick();assert.equal(opened,1);assert.match(cont.querySelector('.recibo-estado').textContent,/Selecciona la captura/);}finally{t.w.close();}
});


test('prepara el día con imágenes JPEG cubiertas y miniaturas; ordena rondas sin incluir originales ni datos bancarios',async()=>{
 const t=setup(),{w}=t;try{w.eval(read('publicacion.js'));w.document.getElementById('fechaSorteo').value='31/10/2026';w.document.getElementById('nom1').value='Ronda 1';w.document.getElementById('nom2').value='Ronda 2';w.crearBotonesPago('pagosBtns2',[pagos()[1]],'ok2');w.crearBotonesPago('pagosBtns1',[pagos()[0]],'ok1');await assert.rejects(w.ComprobantesPagos.prepararDia('2026-10-31'),/Falta pegar/);await attach(w,w.document.querySelector('#pagosBtns2 .recibo-pago'));await attach(w,w.document.querySelector('#pagosBtns1 .recibo-pago'));await assert.rejects(w.ComprobantesPagos.prepararDia('2026-10-31'),/resultado del bingo.*Luis Ejemplo.*Ana Ejemplo/);for(const wrap of w.document.querySelectorAll('.recibo-pago'))await attachResult(wrap);const dia=await w.ComprobantesPagos.prepararDia('2026-10-31');assert.equal(dia.fecha,'2026-10-31');assert.equal(dia.imagenes[0].ronda,'pagosBtns1');assert.equal(dia.imagenes[1].ronda,'pagosBtns2');assert(dia.imagenes.every(i=>i.blob.type==='image/jpeg'&&i.miniatura.type==='image/jpeg'));assert(dia.imagenes.every(i=>!('image' in i)&&!('x' in i)));assert(!JSON.stringify(dia).includes('04121234567'));assert(!JSON.stringify(dia).includes('12345678'));assert.equal(dia.firma,w.ComprobantesPagos.firmaDia('2026-10-31'));}finally{w.close();}
});

async function attachResult(wrap){await wrap.querySelector('.recibo-pegar-resultado').onclick();await tick();}
test('resultado y comprobante se guardan separados por ganador y se recuperan incluso sin pago',async()=>{
 const map=new Map(),t=setup(map),{w}=t;
 try{w.document.getElementById('fechaSorteo').value='31/10/2026';w.crearBotonesPago('pagosBtns1',pagos().slice(0,2),'ok1');const wraps=[...w.document.querySelectorAll('.recibo-pago')];
 await attachResult(wraps[0]);assert.equal(wraps[0].querySelector('.recibo-resultado-vista').hidden,false);assert.equal(wraps[1].querySelector('.recibo-resultado-vista').hidden,true);assert.equal(wraps[0].querySelector('.recibo-pago-vista').hidden,true);assert.equal([...map.values()][0].blob,undefined);
 await attach(w,wraps[1]);await attachResult(wraps[1]);const record=[...map.values()].find(r=>r.blob),resultado=record.resultado;await attach(w,wraps[1]);assert.equal([...map.values()].find(r=>r.blob).resultado,resultado);assert.equal(map.size,2);assert.match(wraps[0].querySelector('.recibo-titular').textContent,/Ana Ejemplo/);assert.match(wraps[1].querySelector('.recibo-pegar-resultado').getAttribute('aria-label'),/Luis Ejemplo/);
 }finally{w.close();}
 const r=setup(map);try{r.w.document.getElementById('fechaSorteo').value='31/10/2026';r.w.crearBotonesPago('pagosBtns1',pagos().slice(0,2),'ok1');await tick();const wraps=[...r.w.document.querySelectorAll('.recibo-pago')];assert.equal(wraps[0].querySelector('.recibo-resultado-vista').hidden,false);assert.equal(wraps[0].querySelector('.recibo-compartir').disabled,true);assert.equal(wraps[1].querySelector('.recibo-compartir').disabled,false);assert.equal(wraps[1].querySelector('.recibo-resultado-vista').hidden,false);}finally{r.w.close();}
});
test('vista diaria une resultado y pago, invalida cambios y no exige resultado para Top',async()=>{
 const t=setup(),{w}=t;try{w.eval(read('publicacion.js'));w.document.getElementById('fechaSorteo').value='31/10/2026';w.crearBotonesPago('pagosBtns1',[pagos()[0]],'ok1');const wrap=w.document.querySelector('.recibo-pago');await attach(w,wrap);await attachResult(wrap);const start=t.calls.length,dia=await w.ComprobantesPagos.prepararDia('2026-10-31');assert(t.calls.slice(start).some(c=>c.k==='fillText'&&c.args[0]==='Ana Ejemplo · Cartón 1'));assert(dia.imagenes[0].alto>1600);const firma=dia.firma;await attachResult(wrap);assert.notEqual(w.ComprobantesPagos.firmaDia('2026-10-31'),firma);
 w.renderPagosTop([{...pagos()[1],carton:'TOP 2',lista:[pagos()[1].x]}]);await attach(w,w.document.querySelector('#pagosBtnsTop .recibo-pago'));const top=await w.ComprobantesPagos.prepararDia('2026-10-31');assert(top.imagenes.some(i=>i.ronda==='pagosBtnsTop'));
 const evt=new w.Event('paste',{bubbles:true,cancelable:true});Object.defineProperty(evt,'clipboardData',{value:{items:[{type:'image/png',getAsFile:()=>new w.Blob(['other'],{type:'image/png'})}]}});wrap.querySelector('.recibo-pegar-resultado').dispatchEvent(evt);await tick();assert(evt.defaultPrevented);assert.notEqual(w.ComprobantesPagos.firmaDia('2026-10-31'),top.firma);
 }finally{w.close();}
});

test('recibe resultados desde el en vivo solo para el ganador, fecha y sorteo correctos',async()=>{const t=setup(),{w}=t;try{w.eval(read('publicacion.js'));w.document.getElementById('fechaSorteo').value='31/10/2026';w.crearBotonesPago('pagosBtns1',[pagos()[0]],'ok1');const a={tipo:'pagosBtns1',carton:1,fecha:'2026-10-31',source:null,blob:new w.Blob(['capture'],{type:'image/png'})};await assert.rejects(w.ComprobantesPagos.recibirResultado({...a,carton:2}),/único/);await assert.rejects(w.ComprobantesPagos.recibirResultado({...a,source:'otro-sorteo'}),/único/);await w.ComprobantesPagos.recibirResultado(a);assert.equal(w.document.querySelector('.recibo-resultado-vista').hidden,false);await assert.rejects(w.ComprobantesPagos.recibirResultado({...a,reemplazar:false}),/Ya hay/);assert.equal(w.document.querySelector('.recibo-pago-vista').hidden,true);}finally{w.close();}});
test('ronda con pozo genera un solo pago combinado por ganador y reparte todos los bolívares sin pago separado',async()=>{
 const t=setup(),{w}=t;try{
 w.datosPozoTest=pagos().map(p=>({...p.x,cartones:[String(p.carton)]}));w.eval('REGISTROS=window.datosPozoTest;construirIndice();');
 w.PozoCapturas={resumenRonda:i=>Number(i)===1?{premio_ronda:1000,premio_pozo:501,total:1501}:null};
 w.document.getElementById('pre1').value='1501';w.document.getElementById('car1').value='1,2';
 assert.equal(w.genR(1),true);await tick();
 const botones=[...w.document.querySelectorAll('#pagosBtns1 button.copy')].filter(b=>b.textContent.includes('Copiar Pago Móvil de '));
 assert.equal(botones.length,2);for(const b of botones)await b.onclick();
 const montos=t.copies.map(s=>Number(s.split('\n')[0].replace(/\./g,'')));assert.deepEqual(montos,[751,750]);assert.equal(montos.reduce((a,b)=>a+b,0),1501);
 assert.match(w.document.getElementById('msg1').innerText,/Ronda: 1.000 Bs \+ Pozo: 501 Bs/);assert.equal(w.document.getElementById('pagosBtnsPozo').children.length,0);
 }finally{w.close();}
});
