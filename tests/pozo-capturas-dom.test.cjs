const{test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const script=fs.readFileSync(path.join(__dirname,'../pozo-capturas.js'),'utf8');
function fixture({bolitas=49,pozo='',fallo=false}={}){
 const dom=new JSDOM('<input id="fechaSorteo" value="13/11/2026"><input id="premioPozo" value="180900"><input id="cartonPozo"><p id="pozoAutoEstado"></p><div id="rondas"><section class="card"><input id="car1" value="325"></section></div>',{runScripts:'outside-only',url:'https://local.test'}),w=dom.window;
 const capturas=[{cartones:[325],blob:{prueba:true}}],e={id:'envio',fecha:'2026-11-13',source:'88',ronda:1,revision:1,capturas},adjuntos=[],calls=[],crops=[];let reiniciado=false;
 w.document.getElementById('cartonPozo').value=pozo;
 w.HTMLCanvasElement.prototype.getContext=()=>({fillRect(){},drawImage:(...args)=>crops.push(args),getImageData:()=>({data:new Uint8ClampedArray(8)}),putImageData(){}});
 w.Tesseract={createWorker:async()=>({setParameters:async()=>{},recognize:async()=>{if(fallo)throw Error('OCR sin conexión');return{data:{text:bolitas+' de 75',confidence:95}};},terminate:async()=>{}})};
 w.EnVivoComun={...require('../rondas-en-vivo-comun.js'),imagen:async()=>({width:1536,height:775})};w.ResultadosPublicos={fechaISO:()=>e.fecha};
 w.mockClient={rpc:async name=>name==='en_vivo_cortes'?{data:{source:'88',revisiones:reiniciado?{'1':1}:{}}}:{data:{pagos:true,source:'88',envios:[e]}}};
 const bootstrap="let SLOT_APPROVED_SOURCE='88';let REINICIANDO_SORTEO=false;const supa=window.mockClient;function monto(s){return Number(s);}function estadoCarton(){return 'OK';}function generarPozo(){window.generados=(window.generados||0)+1;return true;}function guardarEstadoAhora(){window.guardados=(window.guardados||0)+1;}";
 w.PagosCompartidos={puedeEditar:true,editarCuandoLibre:async fn=>{calls.push('editar');await fn();}};w.ComprobantesPagos={recibirResultado:async a=>adjuntos.push(a)};

 return{w,e,capturas,crops,adjuntos,calls,reiniciar:()=>reiniciado=true,close:()=>w.close(),run:async()=>{w.eval(bootstrap+script);await w.PozoCapturas.revisar(e,capturas);}};
}
test('49 de 75 prepara pozo y adjunta su captura, sin confundir la bola grande ni modificar el premio',async()=>{
 const t=fixture();try{await t.run();assert.equal(t.w.document.getElementById('cartonPozo').value,'325',t.w.document.getElementById('pozoAutoEstado').textContent);assert.equal(t.w.document.getElementById('premioPozo').value,'180900');assert.equal(t.w.generados,1);assert.equal(t.adjuntos[0].tipo,'pagosBtnsPozo');assert.equal(t.adjuntos[0].carton,325);assert.match(t.w.document.getElementById('pozoAutoEstado').textContent,/49 bolitas/);assert.equal(t.crops[0][1],1536*.44);assert.equal(t.w.SLOT_APPROVED_SOURCE,undefined);}finally{t.close();}
});
test('53 bolitas, OCR fallido, pozo manual distinto y reinicio no crean ni reemplazan pagos',async()=>{
 for(const options of [{bolitas:53},{fallo:true},{pozo:'999'},{reset:true}]){
  const t=fixture(options);try{if(options.reset)t.reiniciar();await t.run();assert.equal(t.w.generados,undefined);assert.equal(t.adjuntos.length,0);if(options.pozo)assert.equal(t.w.document.getElementById('cartonPozo').value,'999');}finally{t.close();}
 }
});
