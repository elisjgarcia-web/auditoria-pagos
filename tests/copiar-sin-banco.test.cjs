const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM,VirtualConsole}=require('jsdom');

test('copiar pagos sin banco omite el banco, conserva la advertencia y protege datos incompatibles',async()=>{
 const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8').replace(/<script[^>]*src=[^>]*><\/script>/g,'');
 const copies=[];
 const dom=new JSDOM(html,{url:'https://local.test',runScripts:'dangerously',virtualConsole:new VirtualConsole(),beforeParse(w){
  w.supabase={createClient:()=>({})};w.setTimeout=()=>0;w.alert=()=>{};
  Object.defineProperty(w.navigator,'clipboard',{value:{writeText:async text=>copies.push(text)}});
 }});
 const w=dom.window;
 try{
  const cliente={nombre:'Cliente de prueba',telefono:'04121234567',cedula:'12345678',cedulaCompra:'12345678',bancoCodigo:''};
  const expected=[w.fmt(35280),cliente.telefono,cliente.cedula].join('\n');
  // Rondas, final, pozo y consolación comparten este generador de botones.
  for(const id of ['pagosBtns1','pagosBtns6','pagosBtnsPozo','pagosBtnsCon']){
   w.crearBotonesPago(id,[{carton:1,x:cliente,monto:35280}],'okCon');
   const cont=w.document.getElementById(id);
   assert.match(cont.textContent,/Banco no indicado o no reconocido/);
   assert.doesNotMatch(cont.textContent,/COPIA BLOQUEADA|Copia bloqueada/);
   await cont.querySelector('button.copy').onclick();
   assert.equal(copies.at(-1),expected);
  }
  // También el formato de copia usado por Top omite banco y avisos del portapapeles.
  assert.equal(w.textoPagoConCedula(cliente,35280,cliente.cedula),expected);
  const conBanco={...cliente,bancoCodigo:'0105'};
  w.crearBotonesPago('pagosBtnsCon',[{carton:1,x:conBanco,monto:35280}],'okCon');
  await w.document.querySelector('#pagosBtnsCon button.copy').onclick();
  assert.equal(copies.at(-1),expected+'\n0105');
  assert.equal(w.textoPagoConCedula(conBanco,35280,cliente.cedula),expected+'\n0105');
  const intercambiado={...cliente,telefono:cliente.cedula,cedula:cliente.telefono};
  w.crearBotonesPago('pagosBtnsCon',[{carton:1,x:intercambiado,monto:35280}],'okCon');
  assert.match(w.document.getElementById('pagosBtnsCon').textContent,/Confirma con el beneficiario/);
  await w.document.querySelector('#pagosBtnsCon button.copy').onclick();
  assert.equal(copies.at(-1),expected);
  for(const x of [{...cliente,telefono:'123'}, {...cliente,cedula:'ABC'}, null]){
   w.crearBotonesPago('pagosBtnsCon',[{carton:1,x,monto:35280}],'okCon');
   assert.equal(w.document.querySelector('#pagosBtnsCon button.copy'),null);
  }
 }finally{w.close()}
});
