const CACHE_NAME="health-tracker-v21";
const APP_SHELL=[
  "./","./index.html","./style.css?v=21","./training.css?v=21","./notes.css?v=21",
  "./exercise-details.css?v=21","./enhancements.css?v=21","./app.js?v=21",
  "./exercise-details.js?v=21","./enhancements.js?v=21","./manifest.webmanifest","./icon.svg",
  "./assets/exercises/stationary-bike.webp","./assets/exercises/chest-press.webp","./assets/exercises/seated-row.webp",
  "./assets/exercises/leg-curl.webp","./assets/exercises/leg-press.webp","./assets/exercises/hip-thrust.webp",
  "./assets/exercises/pallof-press.webp","./assets/exercises/elliptical.webp","./assets/exercises/lat-pulldown.webp",
  "./assets/exercises/shoulder-press.webp","./assets/exercises/hip-abduction.webp","./assets/exercises/face-pull.webp"
];

self.addEventListener("install",event=>{
  event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate",event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE_NAME).map(key=>caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener("fetch",event=>{
  if(event.request.method!=="GET"||new URL(event.request.url).origin!==self.location.origin)return;
  event.respondWith(fetch(event.request).then(response=>{
    if(response.ok){
      const copy=response.clone();
      caches.open(CACHE_NAME).then(cache=>cache.put(event.request,copy));
    }
    return response;
  }).catch(()=>caches.match(event.request).then(cached=>cached||caches.match("./index.html"))));
});
