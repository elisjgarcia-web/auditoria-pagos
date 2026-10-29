const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
function fn(name){const start=html.indexOf('function '+name+'('),a=start>0&&html.slice(start-6,start)==='async '?'async ':'';const next=html.indexOf('\nfunction ',start+10),end=html.indexOf('\nlet REGISTROS',start);return a+html.slice(start,Math.min(...[next,end].filter(x=>x>start)));}
test('approved free cards remain searchable with registered payment data but never count in Top',async()=>{
 const base=(id,name,ced,cartones,origin='compra')=>({id,nombre:name,cedula:ced,cartones,origen_registro:origin,estado:'aprobado',telefono:'04121111111',pago_banco:'0105',pago_telefono:'04242222222',pago_cedula:'999999',comprobante:null});
 const records=[base(1,'Ana','111111',[1,2]),base(2,'Luis','222222',[3]),base(3,'Mara','333333',[4]),base(4,'Ana','111111',[9,10,11,12],'premio_slot'),base(5,'Solo premio','444444',[20,21,22,23,24],'premio_slot')];
 let fields,rendered;
 const ctx={REGISTROS:[],CARTON_INDEX:{},CARTON_CONFLICTS:new Set(),PDF_CARGADO_DIRECTO:false,RAW_CARTONES:[],RAW_SEGMENTOS_VERIFICACION:[],TOP_RANKING:[],AUDITORIA_OK:false,
 supa:{rpc:async()=>({data:{source:'80',sent:false,winners:[]}}),auth:{getSession:async()=>({data:{session:{}}})},from:()=>({select:s=>{fields=s;return{eq:()=>({range:async()=>({data:records,error:null})})}}})},
 supaDigits:x=>String(x||'').replace(/\D/g,''),codBanco:x=>x,supaValidPago:()=>true,supaSwap:()=>false,supaMensaje:()=>{},mostrarEstado:()=>{},sugerirPlantilla:()=>{},programarGuardado:()=>{},guardarEstadoAhora:()=>{},
 cartonesDia:{},fechaSorteo:{value:'2026-10-28'},textoLista:{},norm:x=>x,monto:Number,num:Number,fmt:String,mejorRegistroTop:l=>l[0],datosTopConsistentes:()=>({ok:true}),renderPagosTop:x=>rendered=x,
 topBs1:{value:'25'},topBs2:{value:'15'},topBs3:{value:'10'},topUsd1:{value:''},topUsd2:{value:''},topUsd3:{value:''},topResultados:{},msgTop:{},alert:m=>{throw Error(m)},console,Date,Map,Set};
 vm.createContext(ctx);
 vm.runInContext(fn('supaCargar')+'\n'+fn('construirIndice')+'\n'+fn('buscar')+'\n'+fn('calcularTopCompras'),ctx);
 await ctx.supaCargar();assert.ok(fields.includes('origen_registro'));assert.equal(ctx.REGISTROS.length,5);
 const free=ctx.buscar(9);assert.equal(free.nombre,'Ana');assert.equal(free.esPremioSlot,true);assert.equal(free.banco,'0105');assert.equal(free.telefono,'04242222222');assert.equal(free.cedula,'999999');assert.equal(free.cedulaCompra,'111111');
 assert.equal(ctx.buscar(20).nombre,'Solo premio');
 assert.equal(ctx.calcularTopCompras(),true);assert.deepEqual(Array.from(ctx.TOP_RANKING,r=>r.nombre),['Ana','Luis','Mara']);assert.deepEqual(Array.from(ctx.TOP_RANKING,r=>r.cantidad),[2,1,1]);assert.equal(rendered.length,3);
});

