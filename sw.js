const CACHE='auditoria-supabase-pwa-v52-youtube-estado-pendiente';
const CORE=['./compacto-pagos.css?v=9','./compacto-pagos.js?v=5','./ruleta-consolacion-pagos.js?v=1','./rondas-en-vivo-comun.js?v=3','./recibir-en-vivo.js?v=13','./recibir-en-vivo.css?v=2','./publicar-comprobantes.js?v=2','./comprobantes-pagos.js?v=9','./comprobantes-pagos.css?v=2','./sincronizacion.js?v=7','./rondas-ruleta.js?v=3','./shared/youtube.js?v=1','./transmision.js?v=4','./','./index.html','./publicacion.js?v=3','./publicacion.css?v=1','./publicar-ganadores.js?v=2','./manifest.webmanifest','./icon-192.png','./icon-512.png'];
const PDFJS=[];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(async c=>{await c.addAll(CORE);await Promise.all(PDFJS.map(u=>c.add(u).catch(()=>{})));}));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim()});
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;const url=new URL(e.request.url);if(url.origin!==location.origin&&!PDFJS.includes(url.href))return;e.respondWith((e.request.mode==='navigate'?fetch(e.request).then(res=>{if(res.ok){const copy=res.clone();caches.open(CACHE).then(c=>c.put(e.request,copy))}return res}).catch(()=>caches.match(e.request)):caches.match(e.request).then(cached=>cached||fetch(e.request).then(res=>{if(res.ok){const copy=res.clone();caches.open(CACHE).then(c=>c.put(e.request,copy))}return res})))) });




self.addEventListener('notificationclick',event=>{
 event.notification.close();
 const destino=new URL('./',self.registration.scope).href;
 event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(async clientes=>{
  const ventana=clientes.find(c=>c.url.startsWith(destino));
  if(ventana){if(ventana.focus)await ventana.focus();return;}
  if(self.clients.openWindow)await self.clients.openWindow(destino);
 }));
});
