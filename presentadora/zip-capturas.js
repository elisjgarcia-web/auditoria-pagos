/* ZIP de capturas sin dependencias ni carga de imágenes a servicios externos.
 * Almacena archivos JPEG originales; mantiene el contenido sin recomprimir. */
(function(root){
'use strict';
const textEncoder=new TextEncoder();
const crcTable=new Uint32Array(256);
for(let i=0;i<256;i++){let c=i;for(let b=0;b<8;b++)c=c&1?0xedb88320^(c>>>1):c>>>1;crcTable[i]=c>>>0;}
function crc32(bytes){let c=0xffffffff;for(let i=0;i<bytes.length;i++)c=crcTable[(c^bytes[i])&255]^(c>>>8);return(c^0xffffffff)>>>0;}
function fechaDos(t){
 const d=t instanceof Date?t:new Date();
 const year=Math.min(2107,Math.max(1980,d.getFullYear()));
 return{date:((year-1980)<<9)|((d.getMonth()+1)<<5)|d.getDate(),time:(d.getHours()<<11)|(d.getMinutes()<<5)|Math.floor(d.getSeconds()/2)};
}
function escribir16(view,offset,value){view.setUint16(offset,value,true);}
function escribir32(view,offset,value){view.setUint32(offset,value>>>0,true);}
async function crearZip(entries){
 if(!Array.isArray(entries)||entries.length<1||entries.length>60000)throw Error('No hay imágenes válidas para crear el ZIP.');
 const cuerpo=[],central=[];let pos=0,centroBytes=0;
 for(const e of entries){
  if(!e||typeof e.name!=='string'||!e.name||e.name.startsWith('/')||e.name.includes('..')||e.name.includes('\\')||!e.blob||typeof e.blob.arrayBuffer!=='function')throw Error('Archivo inválido para el ZIP.');
  const ruta=textEncoder.encode(e.name),size=e.blob.size;
  if(ruta.length>65535||size>0xffffffff)throw Error('Uno de los archivos es demasiado grande.');
  const buffer=new Uint8Array(await e.blob.arrayBuffer()),crc=crc32(buffer),fecha=fechaDos(e.date),header=new Uint8Array(30+ruta.length),h=new DataView(header.buffer);
  escribir32(h,0,0x04034b50);escribir16(h,4,20);escribir16(h,6,0x0800);escribir16(h,8,0);
  escribir16(h,10,fecha.time);escribir16(h,12,fecha.date);escribir32(h,14,crc);
  escribir32(h,18,size);escribir32(h,22,size);escribir16(h,26,ruta.length);escribir16(h,28,0);
  header.set(ruta,30);cuerpo.push(header,e.blob);
  const meta=new Uint8Array(46+ruta.length),v=new DataView(meta.buffer);
  escribir32(v,0,0x02014b50);escribir16(v,4,20);escribir16(v,6,20);escribir16(v,8,0x0800);
  escribir16(v,10,0);escribir16(v,12,fecha.time);escribir16(v,14,fecha.date);escribir32(v,16,crc);
  escribir32(v,20,size);escribir32(v,24,size);escribir16(v,28,ruta.length);
  escribir16(v,30,0);escribir16(v,32,0);escribir16(v,34,0);escribir16(v,36,0);
  escribir32(v,38,0);escribir32(v,42,pos);meta.set(ruta,46);
  central.push(meta);centroBytes+=meta.length;
  pos+=header.length+size;
  if(pos>0xffffffff||centroBytes>0xffffffff)throw Error('El ZIP supera el límite admitido.');
 }
 const end=new Uint8Array(22),v=new DataView(end.buffer);
 escribir32(v,0,0x06054b50);escribir16(v,4,0);escribir16(v,6,0);
 escribir16(v,8,entries.length);escribir16(v,10,entries.length);
 escribir32(v,12,centroBytes);escribir32(v,16,pos);escribir16(v,20,0);
 return new Blob([...cuerpo,...central,end],{type:'application/zip'});
}
const api=Object.freeze({crearZip});
if(typeof module==='object'&&module.exports)module.exports=api;
root.ZipCapturasBingo=api;
})(typeof window!=='undefined'?window:globalThis);
