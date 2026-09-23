// 列國紀元 service worker（2026-09-18，PWA：可加到主畫面／安裝成桌面 app）。
// 原則：程式與資料（html／js／css／json）一律「先上網、失敗才用快取」→ 上線更新後重新整理就是新版，不會被舊快取卡住；
// 圖片、音樂、語音「先用快取、背景更新」→ 第二次開很快，斷線也能玩已載過的內容。快取名稱含版本，改版本會清掉舊快取。
const VERSION='rl-202609230951';
const CORE=['./','./index.html','./rts.css','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(VERSION).then(c=>c.addAll(CORE)).catch(()=>{}));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==VERSION).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
const isCode=url=>/\.(html|js|css|webmanifest|json)$/.test(url.pathname)||url.pathname.endsWith('/');
self.addEventListener('fetch',e=>{
 const req=e.request;if(req.method!=='GET')return;const url=new URL(req.url);if(url.origin!==location.origin)return;
 if(isCode(url)){e.respondWith(fetch(req).then(r=>{if(r.ok){const copy=r.clone();caches.open(VERSION).then(c=>c.put(req,copy))}return r}).catch(()=>caches.match(req).then(r=>r||caches.match('./index.html'))));return}
 e.respondWith(caches.match(req).then(cached=>{const net=fetch(req).then(r=>{if(r.ok){const copy=r.clone();caches.open(VERSION).then(c=>c.put(req,copy))}return r}).catch(()=>cached);return cached||net}))});
