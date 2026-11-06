const {test}=require('node:test'),assert=require('node:assert/strict');
const {crear}=require('../avisos-presentadora.js');
const flush=()=>new Promise(r=>setImmediate(r));
function fixture(){
 let f={uid:'u',fecha:'2026-11-05',source:'88'},reads=0,notices=0,answer=null;const channels=[],states=[];
 const a=crear({contexto:async()=>f,consultar:async()=>{reads++;return answer?answer():{pagos:true,source:f.source,jornada:{fecha:f.fecha}};},notificar:()=>notices++,estado:s=>states.push(s),cerrar:c=>{c.closed=true;},suscribir:(ctx,event,status)=>{const c={ctx,event,status};channels.push(c);return c;}});
 return{a,channels,states,get reads(){return reads;},get notices(){return notices;},context:x=>f=x,answer:x=>answer=x};
}
test('no network until enabled; only matching inserts trigger a check, one connection per context',async()=>{
 const f=fixture();await f.a.actualizar();assert.equal(f.channels.length,0);assert.equal(f.reads,0);
 await f.a.activar();assert.equal(f.channels.length,1);const c=f.channels[0];c.status('SUBSCRIBED');await flush();assert.equal(f.reads,1);
 await f.a.actualizar();assert.equal(f.channels.length,1);
 c.event({new:{fecha:'2026-11-04',source:'88'}});c.event({new:{fecha:'2026-11-05',source:'99'}});await flush();assert.equal(f.reads,1);
 c.event({new:{fecha:'2026-11-05',source:'88'}});await flush();assert.equal(f.reads,2);assert.equal(f.notices,2);
});
test('reconnect checks missed notifications and logout discards in-flight responses',async()=>{
 const f=fixture();await f.a.activar();const c=f.channels[0];c.status('CHANNEL_ERROR');assert.match(f.states.at(-1),/desconectados/);
 let resolve;f.answer(()=>new Promise(r=>resolve=r));c.status('SUBSCRIBED');await flush();assert.equal(f.reads,1);
 f.a.pausar();assert.equal(c.closed,true);resolve({pagos:true,source:'88',jornada:{fecha:'2026-11-05'}});await flush();assert.equal(f.notices,0);
 c.event({new:{fecha:'2026-11-05',source:'88'}});assert.equal(f.reads,1);
});
test('changing date/source closes stale subscription, and concurrent events are reconciled without parallel reads',async()=>{
 const f=fixture();await f.a.activar();const old=f.channels[0];f.context({uid:'u',fecha:'2026-11-06',source:'99'});await f.a.actualizar();assert.equal(old.closed,true);const c=f.channels[1];
 let resolve;f.answer(()=>new Promise(r=>resolve=r));c.event({new:{fecha:'2026-11-06',source:'99'}});c.event({new:{fecha:'2026-11-06',source:'99'}});await flush();assert.equal(f.reads,1);
 f.answer(null);resolve({pagos:true,source:'99',jornada:{fecha:'2026-11-06'}});await flush();assert.equal(f.reads,2);
});
