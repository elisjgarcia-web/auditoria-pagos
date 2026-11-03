const test=require('node:test');
const assert=require('node:assert/strict');
const {crearZip}=require('../presentadora/zip-capturas.js');
test('ZIP de capturas mantiene nombres, archivos y directorio central',async()=>{
 const fotos=[
  {name:'Ronda_01/Ganador_01_Carton_400.jpg',blob:new Blob([Uint8Array.from([0xff,0xd8,0x01,0x02,0xff,0xd9])])},
  {name:'Ronda_02/Ganador_01_Carton_464.jpg',blob:new Blob([Uint8Array.from([0xff,0xd8,0xff,0xd9])])},
  {name:'LEER_PRIMERO.txt',blob:new Blob(['Bingo Andino 75'])}
 ];
 const zip=new Uint8Array(await(await crearZip(fotos)).arrayBuffer()),view=new DataView(zip.buffer);
 const u16=(o)=>view.getUint16(o,true),u32=(o)=>view.getUint32(o,true);
 const end=zip.length-22;
 assert.equal(u32(end),0x06054b50);
 assert.equal(u16(end+10),fotos.length);
 const center=u32(end+16),centerSize=u32(end+12);
 let offset=center;
 for(const original of fotos){
  assert.equal(u32(offset),0x02014b50);
  const size=u32(offset+24),nameLength=u16(offset+28),extraLength=u16(offset+30),commentLength=u16(offset+32);
  const name=new TextDecoder().decode(zip.slice(offset+46,offset+46+nameLength));
  assert.equal(name,original.name);
  assert.equal(size,original.blob.size);
  const local=u32(offset+42);
  assert.equal(u32(local),0x04034b50);
  const start=local+30+u16(local+26)+u16(local+28);
  const originalBytes=new Uint8Array(await original.blob.arrayBuffer());
  assert.deepEqual(zip.slice(start,start+size),originalBytes);
  offset+=46+nameLength+extraLength+commentLength;
 }
 assert.equal(offset,center+centerSize);
});
test('No acepta rutas peligrosas ni archivos vacíos',async()=>{
 await assert.rejects(()=>crearZip([]),/No hay imágenes/);
 await assert.rejects(()=>crearZip([{name:'../archivo.jpg',blob:new Blob(['x'])}]),/inválido/);
});
