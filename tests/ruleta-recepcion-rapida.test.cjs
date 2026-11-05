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
test('nothing is fetched automatically; manual click brings sent winners once',async()=>{
 const f=fixture();try{assert.equal(f.reads,0);assert.equal(f.timers.length,0);assert.equal(f.intervals.length,0);const b=f.el('traerGanadoresRuleta');assert.match(b.textContent,/Traer ganadores/);await b.onclick();assert.equal(f.generated,1);assert.equal(f.el('cartonesCon').value,'75');await b.onclick();assert.equal(f.generated,1);assert.equal(b.disabled,false);}finally{f.close();}
});
test('busy synchronization reports failure without a loop; second manual click retries',async()=>{
 const f=fixture();try{f.busy(true);await f.el('traerGanadoresRuleta').onclick();assert.equal(f.generated,0);assert.equal(f.timers.length,0);assert.equal(f.el('traerGanadoresRuleta').disabled,false);f.busy(false);await f.el('traerGanadoresRuleta').onclick();assert.equal(f.generated,1);}finally{f.close();}
});
test('manual fetch preserves conflicting existing consolation instead of overwriting it',async()=>{
 const f=fixture();try{f.el('cartonesCon').value='99';f.el('premioCon').value='500';await f.el('traerGanadoresRuleta').onclick();assert.equal(f.generated,0);assert.equal(f.el('cartonesCon').value,'99');assert.equal(f.el('premioCon').value,'500');assert.match(f.el('ruletaPagosEstado').textContent,/No la reemplacé/);}finally{f.close();}
});
