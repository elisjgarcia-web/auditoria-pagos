const CACHE='auditoria-supabase-pwa-v16-premios-slot';
const CORE=['./shared/youtube.js?v=1','./transmision.js?v=2','./','./index.html','./publicacion.js?v=3','./publicacion.css?v=1','./publicar-ganadores.js?v=2','./manifest.webmanifest','./icon-192.png','./icon-512.png'];
const PDFJS=[];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(async c=>{await c.addAll(CORE);await Promise.all(PDFJS.map(u=>c.add(u).catch(()=>{})));}));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim()});
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;const url=new URL(e.request.url);if(url.origin!==location.origin&&!PDFJS.includes(url.href))return;e.respondWith((e.request.mode==='navigate'?fetch(e.request).then(res=>{if(res.ok){const copy=res.clone();caches.open(CACHE).then(c=>c.put(e.request,copy))}return res}).catch(()=>caches.match(e.request)):caches.match(e.request).then(cached=>cached||fetch(e.request).then(res=>{if(res.ok){const copy=res.clone();caches.open(CACHE).then(c=>c.put(e.request,copy))}return res})))) });
