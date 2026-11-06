const CACHE='auditoria-supabase-pwa-v59-recepcion-rapida';
const CORE=['./compacto-pagos.css?v=9','./compacto-pagos.js?v=5','./ruleta-consolacion-pagos.js?v=4','./rondas-en-vivo-comun.js?v=3','./avisos-presentadora.js?v=1','./push-presentadora.js?v=1','./recibir-en-vivo.js?v=17','./recibir-en-vivo.css?v=2','./publicar-comprobantes.js?v=2','./comprobantes-pagos.js?v=9','./comprobantes-pagos.css?v=2','./sincronizacion.js?v=8','./rondas-ruleta.js?v=3','./shared/youtube.js?v=1','./transmision.js?v=4','./','./index.html','./publicacion.js?v=3','./publicacion.css?v=1','./publicar-ganadores.js?v=2','./manifest.webmanifest','./icon-192.png','./icon-512.png'];
const PDFJS=[];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(async c=>{await c.addAll(CORE);await Promise.all(PDFJS.map(u=>c.add(u).catch(()=>{})));}));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('auditoria-supabase-pwa-')&&k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim()});
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;const url=new URL(e.request.url);if(url.origin!==location.origin&&!PDFJS.includes(url.href))return;e.respondWith((e.request.mode==='navigate'?fetch(e.request).then(res=>{if(res.ok){const copy=res.clone();caches.open(CACHE).then(c=>c.put(e.request,copy))}return res}).catch(()=>caches.match(e.request)):caches.match(e.request).then(cached=>cached||fetch(e.request).then(res=>{if(res.ok){const copy=res.clone();caches.open(CACHE).then(c=>c.put(e.request,copy))}return res})))) });




self.addEventListener('notificationclick',event=>{
 event.notification.close();
 const destino=new URL('./',self.registration.scope).href;
 event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(async clientes=>{
  const base=new URL(destino);
  const ventana=clientes.find(c=>{const u=new URL(c.url);return u.origin===base.origin&&(u.pathname===base.pathname||u.pathname===base.pathname+'index.html');});
  if(ventana){if(ventana.focus)await ventana.focus();return;}
  if(self.clients.openWindow)await self.clients.openWindow(destino);
 }));
});

self.addEventListener('push',event=>{
 let data={};try{data=event.data?.json()||{};}catch{}
 const prueba=data.type==='test';
 const ronda=Number(data.ronda),cartones=Array.isArray(data.cartones)?data.cartones.filter(n=>Number.isInteger(n)&&n>0&&n<10000):[];
 const body=prueba?'Prueba correcta: los avisos del servidor llegan a este dispositivo.':
  'La presentadora envió una captura'+(ronda>=1&&ronda<=6?' de la ronda '+ronda:'')+(cartones.length?' · Cartón(es) '+cartones.join(', '):'')+'.';
 event.waitUntil(self.registration.showNotification(prueba?'🔔 Prueba de avisos · Bingo Andino 75':'📸 Nuevo ganador · Bingo Andino 75',{
  body,icon:'./icon-192.png',badge:'./icon-192.png',tag:'presentadora:'+(data.id||'nuevo'),renotify:false,
  data:{url:new URL('./',self.registration.scope).href,envioId:data.envioId||null}
 }));
});
