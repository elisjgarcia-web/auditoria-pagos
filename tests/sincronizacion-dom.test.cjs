const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM,VirtualConsole}=require('jsdom');const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
test('phone UI joins as viewer, renders shared payments, takes control and keeps bank data out of shared state',async()=>{
 let cloud=null,controller=false,payments={},rondasSends=0;
 const records=[{nombre:'Ana Prueba',cedula:'12345678',cartones:[1],estado:'aprobado',pago_banco:'0102',pago_telefono:'04121234567',pago_cedula:'12345678'}];
 const mock={auth:{getSession:async()=>({data:{session:{}}})},from:()=>({select:()=>({eq:()=>({range:async()=>({data:records})})})}),rpc:async(name,args)=>{
 if(name==='slot_estado_rondas')return {data:{source:'80',sent:false,winners:[]}};
 if(name==='slot_enviar_rondas'){rondasSends++;return {data:{sent:true,people:1,winners:[]}};}
 assert.equal(name,'pagos_sincronizar');const a=args.a;
 if(a.action==='claim')controller=true;
 if(a.action==='release')controller=false;
 if(a.action==='payment'){assert(cloud.paymentKeys.includes(a.key));payments[a.key]=a.value;}
 return {data:{source:'80',revision:1,formRevision:1,state:cloud,hasState:true,controller,controllerLabel:'Principal',leaseActive:true,payments,events:[]}};
 }};
 const vc=new VirtualConsole();vc.on('jsdomError',e=>{throw e;});
 const d=new JSDOM(read('index.html').replace(/<script[^>]*src=[^>]*><\/script>/g,''),{url:'https://local.test',runScripts:'dangerously',virtualConsole:vc,beforeParse(w){w.supabase={createClient:()=>mock};w.setTimeout=()=>0;w.alert=()=>{};w.confirm=()=>true;}}),w=d.window,el=id=>w.document.getElementById(id);
 try{
 w.eval(read('publicacion.js'));w.eval(read('rondas-ruleta.js'));
 await w.supaCargar();el('fechaSorteo').value='30/10/2026';el('car1').value='1';el('pre1').value='100';w.genR(1);await new Promise(r=>setImmediate(r));
 cloud=w.capturarPagosCompartidos();assert.equal(cloud.form.textoLista,undefined);assert(!JSON.stringify(cloud).includes('04121234567'));assert(!JSON.stringify(cloud).includes('12345678'));
 el('pre1').value='999';w.eval(read('sincronizacion.js'));const sends=rondasSends;
 await el('syncConnect').onclick();assert.equal(el('pre1').value,'100');assert.equal(el('pre1').disabled,true);assert.equal(rondasSends,sends);
 const paid=w.document.querySelector('[data-clave-pago]');assert(paid);assert.equal(paid.disabled,false);await paid.onclick();assert.match(paid.innerText,/PAGADO/);assert.equal(payments[paid.dataset.clavePago],true);
 await el('syncClaim').onclick();assert.equal(el('pre1').disabled,false);assert.match(el('syncStatus').textContent,/principal/);
 }finally{w.close();}
});
