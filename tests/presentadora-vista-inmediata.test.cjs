const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const src=fs.readFileSync(path.join(__dirname,'../presentadora/app.js'),'utf8');
const code=src.slice(src.indexOf('async function cargar(card,file){'),src.indexOf('async function enterRound('));
const flush=()=>new Promise(r=>setImmediate(r));
function setup({failSave=false}={}){
 let resolvePrepare,resolveSave;const paints=[],messages=[],card={blob:{old:true},numeros:'9'},raw={type:'image/png',size:100},prepared={type:'image/jpeg',size:50};
 const c={busy:false,draft:{cards:[card],sent:false},preparando:new WeakSet(),key:()=> 'original-key',revisionReinicioLocal:0,paint:()=>paints.push({blob:card.blob,numeros:card.numeros}),status:s=>messages.push(s),controls(){},$:()=>null,activeCard:null,ocrQueue:Promise.resolve(),C:{preparar:()=>new Promise(r=>resolvePrepare=r),local:async()=>{if(failSave)throw Error('No storage');await new Promise(r=>resolveSave=r);}}};
 vm.createContext(c);vm.runInContext(code,c);
 return{c,card,raw,prepared,paints,messages,start:()=>c.cargar(card,raw),prepare:()=>resolvePrepare({blob:prepared,canvas:{}}),save:()=>resolveSave()};
}
test('preview is visible before compression and persistence finish; manual card edits survive processing',async()=>{
 const f=setup(),p=f.start();assert.equal(f.paints[0].blob,f.raw);assert.equal(f.c.preparando.has(f.card),true);
 f.card.numeros='75';f.card.userEdited=true;f.prepare();await flush();assert.equal(f.paints.at(-1).blob,f.prepared);assert.equal(f.card.numeros,'75');
 f.save();await p;assert.equal(f.c.preparando.has(f.card),false);assert.equal(f.card.numeros,'75');
});
test('save failure restores the prior capture instead of silently discarding it',async()=>{
 const f=setup({failSave:true}),previous=f.card.blob,p=f.start();f.prepare();await p;assert.equal(f.card.blob,previous);assert.equal(f.card.numeros,'9');assert.match(f.messages.at(-1),/No se guardó/);
});
