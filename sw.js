// Service Worker - ワンタッチ管理 PWA
const CACHE_NAME = 'onetouch-v20260403';

// キャッシュするファイル（主要画面とアセット）
const CACHE_FILES = [
  './',
  './login.html',
  './report.html',
  './report-help.html',
  './report-history.html',
  './contractor-dashboard.html',
  './contractor-help.html',
  './contractor-performance.html',
  './master-top.html',
  './account-master.html',
  './office-master.html',
  './company-master.html',
  './partner-master.html',
  './items.html',
  './import.html',
  './help.html',
  './permissions.html',
  './system-admin.html',
  './system-admin-dashboard.html',
  './system-settings.html',
  './setup-wizard.html',
  './docs.html',
  './audit-log.html',
  './demo-mode.js',
  './unified-header.js',
  './icon-pwa-192.png',
  './icon-pwa-512.png',
  './logo.png',
  './manifest.json'
];

// インストール時にキャッシュ
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(CACHE_FILES);
    })
  );
  self.skipWaiting();
});

// 古いキャッシュを削除
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(key) { return key !== CACHE_NAME; })
            .map(function(key) { return caches.delete(key); })
      );
    })
  );
  self.clients.claim();
});

// ネットワーク優先、失敗時にキャッシュ（Network First）
self.addEventListener('fetch', function(event) {
  event.respondWith(
    fetch(event.request).then(function(response) {
      // 成功したらキャッシュも更新
      var clone = response.clone();
      caches.open(CACHE_NAME).then(function(cache) {
        cache.put(event.request, clone);
      });
      return response;
    }).catch(function() {
      // オフライン時はキャッシュから返す
      return caches.match(event.request);
    })
  );
});
