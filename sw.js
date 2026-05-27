// FPL Live – Service Worker v1.0
const CACHE = 'fpl-live-v1';
const STATIC = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&display=swap',
];

// ── INSTALL: pre-cache static assets ──
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(STATIC).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

// ── ACTIVATE: clean old caches ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── FETCH: cache-first for statics, network-first for FPL API ──
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // FPL API → network only (live data)
  if (url.hostname.includes('fantasy.premierleague.com') ||
      url.hostname.includes('allorigins.win')) {
    event.respondWith(fetch(event.request).catch(() => new Response('{}', { headers: { 'Content-Type': 'application/json' } })));
    return;
  }

  // Static assets → cache first
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE).then(cache => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});

// ── PUSH: show notification ──
self.addEventListener('push', event => {
  let data = { title: 'FPL Live', body: 'Your team has an update!' };
  try { data = event.data?.json() ?? data; } catch(_) { data.body = event.data?.text() ?? data.body; }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body:    data.body,
      icon:    './icons/icon-192.png',
      badge:   './icons/icon-192.png',
      vibrate: [100, 50, 100],
      data:    { url: data.url ?? '/' },
      actions: [
        { action: 'open',   title: '📊 View Score' },
        { action: 'dismiss',title: '✕ Dismiss' },
      ],
    })
  );
});

// ── NOTIFICATION CLICK: open app ──
self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'dismiss') return;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const existing = list.find(c => c.url.includes('fpl'));
      if (existing) return existing.focus();
      return clients.openWindow(event.notification.data?.url ?? '/');
    })
  );
});

// ── BACKGROUND SYNC: periodic score check ──
self.addEventListener('periodicsync', event => {
  if (event.tag === 'fpl-score-check') {
    event.waitUntil(checkScores());
  }
});

async function checkScores() {
  try {
    // Read saved state from IndexedDB (set by main app)
    const db = await openDB();
    const saved = await getFromDB(db, 'state');
    if (!saved) return;

    const { teamId, gw, prevPoints } = saved;
    const url = `https://api.allorigins.win/raw?url=${encodeURIComponent(`https://fantasy.premierleague.com/api/entry/${teamId}/event/${gw}/picks/`)}`;
    const r = await fetch(url);
    const data = await r.json();
    const newPts = data?.entry_history?.points;

    if (prevPoints !== null && newPts !== prevPoints) {
      await self.registration.showNotification('⚽ Score Update', {
        body: `Your FPL team now has ${newPts} pts in GW${gw}!`,
        icon: './icons/icon-192.png',
      });
      await saveToDB(db, 'state', { ...saved, prevPoints: newPts });
    }
  } catch(e) {
    console.error('BG sync error:', e);
  }
}

// ── Simple IndexedDB helpers ──
function openDB() {
  return new Promise((res, rej) => {
    const req = indexedDB.open('fpl-live', 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore('kv');
    req.onsuccess = e => res(e.target.result);
    req.onerror   = e => rej(e);
  });
}
function getFromDB(db, key) {
  return new Promise((res, rej) => {
    const tx  = db.transaction('kv', 'readonly');
    const req = tx.objectStore('kv').get(key);
    req.onsuccess = e => res(e.target.result);
    req.onerror   = e => rej(e);
  });
}
function saveToDB(db, key, value) {
  return new Promise((res, rej) => {
    const tx  = db.transaction('kv', 'readwrite');
    const req = tx.objectStore('kv').put(value, key);
    req.onsuccess = () => res();
    req.onerror   = e => rej(e);
  });
}
