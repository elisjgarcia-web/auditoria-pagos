const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const script=fs.readFileSync(path.join(__dirname,'../ruleta-consolacion-pagos.js'),'utf8');
function fixture(){
 const dom=new JSDOM('<body><section class="card"><label>Consolación</label><input id="premioCon"><input id="cartonesCon"></section><input id="fechaSorteo" value="2026-11-04"><input id="tasaCambio" value="900"><input id="cant" value="6">'+Array.from({length:6},(_,i)=>'<input id="car'+(i+1)+'">').join('')+'</body>',{url:'https://local.test',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,el=id=>w.document.getElementById(id),timers=[],intervals=[];let reads=0,generated=0,busy=false;
 w.setTimeout=(fn,ms)=>{timers.push({fn,ms});return timers.length;};w.setInterval=(fn,ms)=>{intervals.push({fn,ms});return intervals.length;};
 w.ResultadosPublicos={fechaISO:x=>x};w.SLOT_APPROVED_SOURCE='88';w.monto=x=>Number(x);w.fmt=String;w.carts=x=>String(x).split(',').map(x=>x.trim()).filter(Boolean);w.estadoCarton=()=> 'OK';w.buscar=()=>({cedulaCompra:'123'});
 w.generarCon=()=>{generated++;return true;};
 w.supa={auth:{getSession:async()=>({data:{session:{}}})},rpc:async()=>{reads++;return{data:{source:'88',winners:[{drawId:'d1',ticket:'75',prize:'10 USD',prizeType:'consolation',createdAt:'2026-11-04T23:00:00Z'}]}};}};
 w.PagosCompartidos={conectado:true,puedeEditar:true,aplicando:false,editar:async(fn)=>{if(busy)throw Error('Espera a que termine la sincronización e intenta de nuevo.');await fn();}};
 w.eval(script);
 return{w,el,timers,intervals,get reads(){return reads;},get generated(){return generated;},busy:v=>busy=v,close:()=>w.close(),retry:async(ms)=>{const i=timers.findIndex(t=>t.ms===ms);assert.ok(i>=0,'retry scheduled');const t=timers.splice(i,1)[0];t.fn();await new Promise(r=>setImmediate(r));}};
}
test('a winner waiting for shared sync is retried without duplicate payments',async()=>{
 const f=fixture();try{f.busy(true);await f.w.RuletaConsolacionPagos.revisar(true);assert.equal(f.generated,0);f.busy(false);await f.retry(700);assert.equal(f.el('cartonesCon').value,'75');assert.equal(f.el('premioCon').value,'9000');assert.equal(f.generated,1);await f.w.RuletaConsolacionPagos.revisar(true);assert.equal(f.generated,1);}finally{f.close();}
});
test('leaving an edited field brings waiting winners, without replacing an active edit',async()=>{
 const f=fixture();try{f.el('premioCon').focus();await f.w.RuletaConsolacionPagos.revisar();assert.equal(f.generated,0);f.el('premioCon').blur();await f.retry(250);assert.equal(f.generated,1);assert.equal(f.el('cartonesCon').value,'75');}finally{f.close();}
});
test('hidden app does not poll and offline shared sync does not create a rapid retry loop',async()=>{
 const f=fixture();try{assert.equal(f.intervals[0].ms,4000);Object.defineProperty(f.w.document,'hidden',{value:true,configurable:true});await f.w.RuletaConsolacionPagos.revisar();assert.equal(f.reads,0);Object.defineProperty(f.w.document,'hidden',{value:false,configurable:true});f.w.PagosCompartidos.puedeEditar=false;await f.w.RuletaConsolacionPagos.revisar();assert.equal(f.generated,0);assert.ok(!f.timers.some(t=>t.ms===700));}finally{f.close();}
});
