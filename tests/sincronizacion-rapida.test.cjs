const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {crear}=require('../sincronizacion.js');
test('unchanged shared form and payment-only updates do not rebuild images; newer remote edits still apply',async()=>{
 let applies=0,version=1,payments={},lastPayments,local={form:{rondas:[]}};
 const e=crear({device:'d',label:()=>'',uuid:()=>crypto.randomUUID(),snapshot:()=>local,apply:s=>{applies++;local=s;},payments:p=>lastPayments=p,roles(){},notice(){},events(){},backup(){},rpc:async()=>({data:{source:'88',revision:1,formRevision:version,controller:true,state:{form:{rondas:[],value:version}},payments}})});
 await e.conectar('88');assert.equal(applies,1);await e.leer();assert.equal(applies,1);
 payments={ganador:true};await e.leer();assert.equal(applies,1);assert.equal(lastPayments.ganador,true);
 version=2;await e.leer();assert.equal(applies,2);assert.equal(local.form.value,2);await e.salir();
});
test('one manual operation waits for sync, then edits once; stale request is cancelled',async()=>{
 const src=fs.readFileSync(path.join(__dirname,'../sincronizacion.js'),'utf8'),code=src.slice(src.indexOf('async function editarCuandoLibre('),src.indexOf('root.PagosCompartidos={'));
 let busy=true,edits=0,valid=true;const callbacks=[];
 const c={edicionLocal:false,starting:false,reiniciando:false,client:{estado:()=>({busy,applying:false})},root:{PagosCompartidos:{editar:async fn=>{edits++;return fn();}}},setTimeout:fn=>callbacks.push(fn),Date};vm.createContext(c);vm.runInContext(code,c);
 const work=c.editarCuandoLibre(()=> 'ok',{vigente:()=>valid});assert.equal(edits,0);busy=false;callbacks.shift()();assert.equal(await work,'ok');assert.equal(edits,1);
 busy=true;const obsolete=c.editarCuandoLibre(()=>assert.fail(),{vigente:()=>valid});valid=false;callbacks.shift()();await assert.rejects(obsolete,/sorteo cambió/);assert.equal(edits,1);
});
test('la suma de pozo pasa por la revisión compartida y aplica el total antes de permitir otro pago',async()=>{
 let local={form:{rondas:[]}},version=1;const actions=[],order=[];
 const e=crear({device:'d',label:()=>'',uuid:()=>crypto.randomUUID(),snapshot:()=>local,apply:s=>{order.push('apply');local=s;},pozo:p=>{if(p)order.push('pozo');},payments(){},roles(){},notice(){},events(){},backup(){},rpc:async a=>{actions.push(a.action);if(a.action==='pozo'){assert.equal(a.formRevision,1);version++;}return{data:{source:'88',revision:version,formRevision:version,controller:true,state:{form:{rondas:[{i:1,pre:version===1?'1000':'1500'}]}},pozo:version>1?{total:1500}:null,payments:{}}};}});
 await e.conectar('88');assert.equal(await e.sumarPozo({ronda:1}),true);assert.deepEqual(actions,['join','pozo']);assert.deepEqual(order.slice(-2),['pozo','apply']);assert.equal(local.form.rondas[0].pre,'1500');await e.salir();
});
