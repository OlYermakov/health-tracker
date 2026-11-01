const VERSION="38";
const CACHE_NAME=`health-tracker-v${VERSION}`;
const APP_SHELL=[
  "./","./index.html",
  ...["style.css","training.css","notes.css","enhancements.css","analytics.css",
    "events.js","app.js","exercise-details.js",
    ...["model","core","training-log","history","pool","guided-workout","archive-backup","insights","init"].map(name=>`enhancements/${name}.js`),
    "analytics.js","health-import-worker.js"].map(file=>`./${file}?v=${VERSION}`),
  "./manifest.webmanifest","./icon.svg",
  ...["icon-192.png","icon-512.png","icon-maskable-512.png","apple-touch-icon.png"].map(file=>`./icons/${file}`),
  ...["stationary-bike","chest-press","seated-row","leg-curl","leg-press","hip-thrust",
    "pallof-press","elliptical","lat-pulldown","shoulder-press","hip-abduction","face-pull"].map(name=>`./assets/exercises/${name}.webp`)
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
  const request=event.request;
  if(request.method!=="GET"||new URL(request.url).origin!==self.location.origin)return;
  event.respondWith(fetch(request).then(response=>{
    if(response.ok){
      const copy=response.clone();
      event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.put(request,copy)));
    }
    return response;
  }).catch(async()=>{
    const cached=await caches.match(request);
    if(cached)return cached;
    // Fall back to the app page only for page navigations, never for scripts, styles or images.
    if(request.mode==="navigate")return (await caches.match("./index.html"))||(await caches.match("./"))||Response.error();
    return Response.error();
  }));
});
