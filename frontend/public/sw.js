// Minimal service worker: exists only to make Tend installable as a PWA.
// Intentionally no offline caching or background sync — capture goes straight
// to the network. Keeping it a no-op avoids stale-asset and sync-conflict bugs.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Pass-through fetch handler. Required for the app to count as installable in
// some browsers; deliberately does not cache.
self.addEventListener("fetch", () => {});
