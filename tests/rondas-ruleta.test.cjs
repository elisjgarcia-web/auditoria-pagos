const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM,VirtualConsole}=require('jsdom');const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
global.ResultadosPublicos=require('../publicacion.js');const {preparar}=require('../rondas-ruleta.js');
test('preparation includes every tied round winner and final, ignores consolation/pozo/top, rejects invalid cards',()=>{
 const f={fecha:'29/10/2026',cantidad:6,rondas:['1, 2','','3','','','4,5']};
 assert.deepEqual(preparar(f,()=>true),{fecha:'2026-10-29',rondas:[{orden:1,tipo:'ronda',cartones:[1,2]},{orden:3,tipo:'ronda',cartones:[3]},{orden:6,tipo:'final',cartones:[4,5]}]});
 for(const raw of ['1, 1','1, basura','99999'])assert.throws(()=>preparar({...f,rondas:[raw,'','','','','']},()=>true));
 assert.throws(()=>preparar(f,c=>c!==2));assert.throws(()=>preparar({...f,rondas:['','','','','','']},()=>true));
});
test('payments DOM sends only approved current-bingo rounds; update and failure handling; no purchase or payment writes',async()=>{
 let sent=[],source='80',fail=false;
 const records=[{nombre:'Ana Prueba',cedula:'123',cartones:[1,2],estado:'aprobado'},{nombre:'Luis Prueba',cedula:'456',cartones:[3],estado:'aprobado'}];
 const mock={auth:{getSession:async()=>({data:{session:{}}})},from:()=>({select:()=>({eq:()=>({range:async()=>({data:records})})})}),rpc:async(name,args)=>{
  if(name==='slot_estado_rondas')return {data:{source,sent:false,winners:[]}};
  assert.equal(name,'slot_enviar_rondas');sent.push(args);if(fail)return {error:{message:'Error de conexión'}};
  return {data:{source,sent:true,people:2,sentAt:'2026-10-29T20:00:00Z',winners:[{name:'Ana Prueba',ticket:'1',round:1,type:'ronda'},{name:'Luis Prueba',ticket:'3',round:1,type:'ronda'}]}};
 }};
 const errors=new VirtualConsole();errors.on('jsdomError',e=>{if(!e.message.includes('navigation'))throw e;});
 const dom=new JSDOM(read('index.html').replace(/<script[^>]*src=[^>]*><\/script>/g,''),{url:'https://local.test',runScripts:'dangerously',virtualConsole:errors,beforeParse(w){w.supabase={createClient:()=>mock};w.setTimeout=()=>0;w.alert=()=>{};}});const w=dom.window,el=id=>w.document.getElementById(id);
 try{
 w.eval(read('publicacion.js'));w.eval(read('rondas-ruleta.js'));
 el('car1').value='1,3';el('fechaSorteo').value='29/10/2026';
 await w.enviarRondasRuleta();assert.equal(sent.length,0);assert.match(el('ruletaEstado').textContent,/Carga los aprobados/);
 await w.supaCargar();el('car1').value='1,3';el('car6').value='2';await w.enviarRondasRuleta();
 assert.equal(sent[0].p_source,'80');assert.equal(sent[0].p_rondas[0].cartones.length,2);assert.equal(sent[0].p_rondas[1].tipo,'final');assert.match(el('ruletaEstado').textContent,/2 personas/);assert.match(el('ruletaLista').textContent,/Luis Prueba/);assert.ok(!JSON.stringify(sent).includes('cedula'));
 el('car1').value='3';el('car1').dispatchEvent(new w.Event('input',{bubbles:true}));assert.match(el('ruletaEstado').textContent,/modificadas/);await w.enviarRondasRuleta();assert.deepEqual(Array.from(sent[1].p_rondas[0].cartones),[3]);
 fail=true;await w.enviarRondasRuleta();assert.match(el('ruletaEstado').textContent,/Error de conexión/);assert.equal(el('enviarRondasRuleta').disabled,false);
 }finally{w.close();}
});
