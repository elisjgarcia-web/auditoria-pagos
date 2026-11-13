const{test}=require('node:test'),assert=require('node:assert/strict');
const{contador,evaluar,crear}=require('../pozo-capturas.js');
const foto=n=>({cartones:[n],blob:{bolitas:49}}),envio=(ronda,id='r'+ronda)=>({id,fecha:'2026-11-13',source:'88',ronda,revision:1});
test('cuenta N de 75; no confunde última bola 57 o cartón 325 con 49 bolitas; ejemplos reales y límite inclusivo',()=>{
 assert.equal(contador('G 57 · Premio cartón: 325'),null);assert.equal(contador('G 57 · 49 de 75 · Cartón Nº 325'),49);
 for(const n of [58,61,56,57,49]){assert.equal(contador(n+'de75'),n);assert.equal(evaluar([foto(325)],[n]).tipo,n<=52?'califica':'no_califica');}
 assert.equal(evaluar([foto(1)],[52]).tipo,'califica');assert.equal(evaluar([foto(1)],[53]).tipo,'no_califica');
 assert.equal(contador('0 de 75'),null);assert.equal(contador('149 de 75'),null);assert.equal(contador('49 de 75 y 58 de 75'),null);assert.equal(contador('S49 de 75'),null);
});
test('empatados deben tener contador claro e igual; no pierde ni duplica cartones',()=>{
 assert.deepEqual(evaluar([foto(192),foto(872)],[52,52]),{tipo:'califica',bolitas:52,cartones:[192,872]});
 for(const ns of [[52,null],[49,53]])assert.equal(evaluar([foto(192),foto(872)],ns).tipo,'revisar');
 assert.equal(evaluar([foto(192),foto(192)],[49,49]).tipo,'revisar');
});
test('cualquier ronda gana el pozo; si llega desordenada espera las anteriores, agrupa empatados y no se repite OCR',async()=>{
 const preparados=[],avisos=[];let lecturas=0;
 const detector=crear({leer:async b=>{lecturas++;return b.bolitas;},vigente:async()=>true,aplicar:async r=>preparados.push(r),aviso:t=>avisos.push(t)});
 await detector.revisar(envio(2),[foto(192),foto(872)]);assert.equal(preparados.length,0);assert.match(avisos.at(-1),/rondas anteriores/);
 await detector.revisar(envio(1),[{cartones:[735],blob:{bolitas:58}}]);assert.equal(preparados.length,1);assert.equal(preparados[0].e.ronda,2);assert.deepEqual(preparados[0].resultado.cartones,[192,872]);
 await detector.revisar(envio(2),[foto(192),foto(872)]);assert.equal(lecturas,3);
});
test('reinicio o revisión nueva durante OCR no prepara un pozo antiguo; fallo de imagen pide revisión',async()=>{
 let valid=true,finish;const aplicados=[],avisos=[];
 const detector=crear({leer:async()=>new Promise(r=>finish=r),vigente:async()=>valid,aplicar:async r=>aplicados.push(r),aviso:t=>avisos.push(t)});
 const p=detector.revisar(envio(1),[foto(325)]);await new Promise(r=>setImmediate(r));valid=false;finish(49);await p;assert.equal(aplicados.length,0);
 valid=true;await detector.revisar(envio(1,'nuevo'),[{cartones:[325],error:Error('descarga')}]);assert.equal(aplicados.length,0);assert.match(avisos.at(-1),/manualmente/);
});
