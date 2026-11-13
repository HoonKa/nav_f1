// Pit Wall Nav 서비스 워커: 앱 화면은 최신 우선, 음성 클립은 한 번 받으면 폰에 저장
const SHELL = "pw-shell-v1", VOICE = "pw-voice-v1";
self.addEventListener("install", e => { self.skipWaiting(); e.waitUntil(caches.open(SHELL).then(c => c.addAll(["./", "index.html", "manifest.webmanifest", "icon-192.png"]))); });
self.addEventListener("activate", e => { e.waitUntil(self.clients.claim()); });
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return; // 지도·티맵 등 외부 요청은 그대로
  if (u.pathname.includes("/voice/") && u.pathname.endsWith(".mp3")) {
    e.respondWith(caches.open(VOICE).then(async c => (await c.match(e.request)) || fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; })));
    return;
  }
  e.respondWith(fetch(e.request).then(r => { if (r.ok) caches.open(SHELL).then(c => c.put(e.request, r.clone())); return r; }).catch(() => caches.match(e.request)));
});
