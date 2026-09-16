/*
 * Zugvogel offline.
 *
 * The app is used on platforms, in underpasses and on moving trains, which is
 * exactly where reception fails. Three rules:
 *
 *   static build output  cache first   it never changes under a hashed name
 *   pages                network first the timetable is worth a round trip
 *   api                  network first but keep the last answer, so a board
 *                                      that already loaded still shows
 *                                      something rather than an error page
 *
 * Nothing is precached except the shell: a timetable cached at breakfast is
 * worse than no timetable, so cached API answers are only ever a fallback.
 */

const VERSION = "zugvogel-v1";
const SHELL = VERSION + "-shell";
const DATA = VERSION + "-data";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(["/", "/manifest.webmanifest", "/icon.svg"]))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw error;
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(SHELL);
    cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Map tiles come from someone else's server and are immutable; letting the
  // browser's own HTTP cache handle them keeps this worker out of the way.
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    event.respondWith(networkFirst(request, DATA));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      networkFirst(request, SHELL).catch(() =>
        caches.match("/").then((r) => r ?? Response.error()),
      ),
    );
  }
});
