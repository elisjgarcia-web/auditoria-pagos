const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../presentadora/app.js'),'utf8');
const handler=source.slice(source.indexOf("$('nuevoSorteoPresentadora').onclick=async()=>{"),source.indexOf("$('actualizarRondas').onclick=loadDate;"));
function setup(fail=false){
 const calls=[],nodes=new Map(),storage=new Map();
 const $=id=>{if(!nodes.has(id))nodes.set(id,{value:'2026-11-04',replaceChildren(){}});return nodes.get(id);};
 const c={$,user:{id:'u'},busy:false,draft:null,config:{fecha:'2026-11-04',source:'88'},rows:[],revisionReinicioLocal:0,esperandoNuevoSorteo:false,autoFecha:false,turno:0,selected:1,activeCard:null,
 C:{fecha:x=>x,uuid:()=> 'epoch',borrarBorradores:async()=>calls.push('local-clear')},confirm:()=>true,controls(){},status:x=>calls.push(x),notice(){},paint(){},informarFecha(){},release(){},claveEpocaLocal:()=> 'epoch-key',registrarCierre:()=>({key:'closed',previous:null}),localStorage:{setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
 rpc:async(name,args)=>{calls.push(name);if(name==='en_vivo_contexto')return {source:'88',envios:[]};if(fail)throw Error('Sin conexión');assert.equal(args.p_source,'88');return {source:'88',sent:false};}};
 vm.createContext(c);vm.runInContext(handler,c);return {c,calls,run:()=>$('nuevoSorteoPresentadora').onclick()};
}
test('presentadora confirms shared exclusions reset before clearing local work',async()=>{const x=setup();await x.run();assert.deepEqual(x.calls.slice(0,3),['en_vivo_contexto','slot_reiniciar_rondas','local-clear']);assert.equal(x.c.esperandoNuevoSorteo,true);assert.equal(x.c.busy,false);});
test('failed remote reset keeps presenter draft and allows retry',async()=>{const x=setup(true);const config=x.c.config;await x.run();assert.ok(!x.calls.includes('local-clear'));assert.equal(x.c.config,config);assert.equal(x.c.busy,false);assert.match(x.calls.at(-1),/No se pudo completar/);});
