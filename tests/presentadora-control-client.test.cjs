const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const src=fs.readFileSync(path.join(__dirname,'../presentadora/app.js'),'utf8');
const code=src.slice(src.indexOf("$('guardarRondas').onclick=async()=>{"),src.indexOf("$('nuevoSorteoPresentadora').onclick=async()=>{"));
function setup({local=null,fail=false,confirmar=true}={}){
 const nodes=new Map(),calls=[];
 const $=id=>{if(!nodes.has(id))nodes.set(id,{value:'6',textContent:''});return nodes.get(id);};
 const c={$,user:{id:'u'},busy:false,config:{fecha:'2026-11-12',source:'88',rondas:['1','2','3','4','Final'],maestroId:null},draft:{cards:[]},esperandoNuevoSorteo:false,preparando:new WeakSet(),confirm:()=>confirmar,controls(){},save:async()=>calls.push('saved'),key:r=>'round-'+r,C:{local:async key=>key==='round-5'?local:null},status:s=>calls.push(s),loadDate:async()=>calls.push('reloaded'),rpc:async(n,a)=>{calls.push({n,a});if(fail)throw Error('sin conexión');return {source:'88',rondas:['1','2','3','4','5','Final']};}};
 vm.createContext(c);vm.runInContext(code,c);return{c,calls,$,run:()=>$('guardarRondas').onclick()};
}
test('selector saves pending work, passes exact current draw/version, then reloads only after confirmation',async()=>{
 const x=setup();await x.run();assert.equal(x.calls[0],'saved');assert.equal(x.calls[1].n,'en_vivo_cambiar_cantidad');assert.equal(x.calls[1].a.p_cantidad,6);assert.equal(x.calls[1].a.p_source,'88');assert.equal(x.calls[1].a.p_rondas_anteriores.length,5);assert.equal(x.calls[2],'reloaded');assert.equal(x.c.busy,false);
});
test('affected local capture blocks count change; cancellation and network failure preserve work',async()=>{
 const blocked=setup({local:{sent:false,cards:[{blob:{size:100},numeros:'75'}]}});await blocked.run();assert.ok(!blocked.calls.some(c=>c?.n));assert.match(blocked.$('cantidadEstado').textContent,/capturas pendientes/);
 const cancelled=setup({confirmar:false});await cancelled.run();assert.equal(cancelled.calls.length,0);
 const failed=setup({fail:true}),old=failed.c.draft;await failed.run();assert.equal(failed.c.draft,old);assert.equal(failed.$('cantidadRondas').value,'5');assert.ok(!failed.calls.includes('reloaded'));assert.equal(failed.c.busy,false);
});
