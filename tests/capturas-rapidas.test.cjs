const {test}=require('node:test'),assert=require('node:assert/strict'),{recuperar}=require('../presentadora/capturas-rapidas.js');
test('already downloaded images are reused without waiting for storage requests',async()=>{
 const blob={size:20},r={capturas:[{ruta:'u/day/a.jpg',cartones:[75]}]};let updates=0;
 const cards=await recuperar(r,{cards:[{ruta:'u/day/a.jpg',blob,uploaded:true}]},{validar(){},descargar(){assert.fail('No duplicate download');},recibida(){updates++;}});
 assert.equal(cards[0].blob,blob);assert.equal(cards[0].numeros,'75');assert.equal(updates,1);
});
test('multiple images download concurrently with a bound and appear as each finishes in source order',async()=>{
 const remote={capturas:Array.from({length:5},(_,i)=>({ruta:String(i),cartones:[i+1]}))},holds=new Map(),shown=[];let active=0,max=0;
 const p=recuperar(remote,null,{validar(){},descargar:r=>new Promise(resolve=>{active++;max=Math.max(max,active);holds.set(r,()=>{active--;resolve({size:10,path:r});});}),recibida:(card,i)=>shown.push(i)});
 assert.equal(holds.size,3);holds.get('1')();await new Promise(r=>setImmediate(r));assert.deepEqual(shown,[1]);assert.equal(holds.size,4);holds.get('0')();holds.get('2')();await new Promise(r=>setImmediate(r));holds.get('3')();holds.get('4')();const result=await p;assert.equal(max,3);assert.deepEqual(result.map(c=>c.blob.path),['0','1','2','3','4']);
});
test('foreign image paths are rejected before any download',async()=>{
 await assert.rejects(recuperar({capturas:[{ruta:'foreign',cartones:[1]}]},null,{validar(){throw Error('wrong owner');},descargar(){assert.fail();}}),/wrong owner/);
});

test('payment capture downloads preserve order and keep successful images when another fails',async()=>{
 const {prepararCapturas}=require('../recibir-en-vivo.js');const completed=[];
 const out=await prepararCapturas([{ruta:'a'},{ruta:'b'},{ruta:'c'}],async c=>{completed.push(c.ruta);if(c.ruta==='b')throw Error('failed');return {size:10,path:c.ruta};});
 assert.deepEqual(out.map(c=>c.ruta),['a','b','c']);assert.equal(out[0].blob.path,'a');assert.equal(out[2].blob.path,'c');assert.match(out[1].error.message,/failed/);assert.equal(completed.length,3);
});

test('presenter retains successful images when another download fails and can reuse them on retry',async()=>{
 const remote={capturas:[{ruta:'ok',cartones:[1]},{ruta:'fail',cartones:[2]}]};
 const cards=await recuperar(remote,null,{validar(){},descargar:async ruta=>{if(ruta==='fail')throw Error('offline');return {size:10};}});
 assert.ok(cards[0].blob);assert.equal(cards[1].blob,null);assert.match(cards[1].msg,/reintentar/);
 const calls=[];const retry=await recuperar(remote,{cards},{validar(){},descargar:async ruta=>{calls.push(ruta);return {size:10};}});assert.deepEqual(calls,['fail']);assert.ok(retry.every(c=>c.blob));
});
