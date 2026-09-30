const CACHE_NAME = "tdm-app-v12-10-install";

const APP_SHELL = [
"./",
"./index.html",
"./product.html",
"./cart.html",
"./checkout.html",
"./service.html",
"./account.html",
"./auth.html",
"./login.html",
"./signup.html",
"./auth-common.js",
"./customer-common.js",
"./contact.html",
"./admin-dashboard.html",
"./admin-orders.html",
"./admin-store.html",
"./admin-media.html",
"./admin-shipping.html",
"./admin-affiliate.html",
"./admin-common.js",
"./admin-ui.css",
"./logo.png",
"./icon-192x192.png",
"./icon-512x512.png",
"./app.css",
"./app-common.js",
"./push-notifications.js",
"./pwa-install.js",
"./manifest.json",
"./customer-ui.css"
];

/* ================================
INSTALL
================================ */

self.addEventListener("install", event => {
event.waitUntil(
caches.open(CACHE_NAME)
.then(cache => cache.addAll(APP_SHELL))
.catch(error => {
console.error(
"TDM service worker cache error:",
error
);
})
);

self.skipWaiting();
});

/* ================================
ACTIVATE
================================ */

self.addEventListener("activate", event => {
event.waitUntil(
caches.keys().then(keys =>
Promise.all(
keys
.filter(key => key !== CACHE_NAME)
.map(key => caches.delete(key))
)
)
);

self.clients.claim();
});

/* ================================
PUSH NOTIFICATION
================================ */

self.addEventListener("push", event => {
event.waitUntil(
(async () => {

let data = {};  

  try {  
    if (event.data) {  
      data = event.data.json();  
    }  
  } catch (error) {  

    try {  
      data = {  
        body: event.data  
          ? event.data.text()  
          : ""  
      };  
    } catch (_) {  
      data = {};  
    }  

  }  

  const title =  
    data.title ||  
    "TDM Manufacturing";  

  const body =  
    data.body ||  
    data.description ||  
    "A new update is available from TDM Manufacturing.";  

  const productName =  
    data.productName ||  
    data.product_name ||  
    "";  

  const image =  
    data.image ||  
    data.image_url ||  
    "";  

  const url =  
    data.url ||  
    data.product_url ||  
    "https://www.tdmmanufacturing.com/";  

  const notificationOptions = {  

    body:  
      productName &&  
      !body.includes(productName)  

        ? `${productName}\n${body}`  

        : body,  

    icon:  
      data.icon ||  
      "https://www.tdmmanufacturing.com/icon-192x192.png",  

    badge:  
      data.badge ||  
      "https://www.tdmmanufacturing.com/icon-192x192.png",  

    data: {  
      url: url,  
      productName: productName  
    },  

    tag:  
      data.tag ||  
      "tdm-new-product",  

    renotify: true,  

    requireInteraction: false  

  };  

  /*  
   * Some browsers support large notification  
   * images. We only add it when supplied.  
   */  

  if (image) {  
    notificationOptions.image = image;  
  }  

  await self.registration.showNotification(  
    title,  
    notificationOptions  
  );  

})()

);
});

/* ================================
NOTIFICATION CLICK
================================ */

self.addEventListener(
"notificationclick",
event => {

event.notification.close();  

const targetUrl =  
  event.notification &&  
  event.notification.data &&  
  event.notification.data.url  

    ? event.notification.data.url  

    : "https://www.tdmmanufacturing.com/";  

event.waitUntil(  

  clients.matchAll({  
    type: "window",  
    includeUncontrolled: true  
  })  

  .then(windowClients => {  

    for (const client of windowClients) {  

      try {  

        const clientUrl =  
          new URL(client.url);  

        const target =  
          new URL(targetUrl);  

        if (  
          clientUrl.origin ===  
          target.origin  
        ) {  

          return client  
            .navigate(targetUrl)  
            .then(() => client.focus());  

        }  

      } catch (_) {}  

    }  

    return clients.openWindow(  
      targetUrl  
    );  

  })  

);

}
);

/* ================================
NOTIFICATION CLOSE
================================ */

self.addEventListener(
"notificationclose",
event => {

/*  
 * Reserved for future notification  
 * analytics.  
 */

}
);

/* ================================
FETCH / PWA CACHE
================================ */

self.addEventListener("fetch", event => {

if (event.request.method !== "GET") {
return;
}

const url =
new URL(event.request.url);

/*

Only handle requests belonging

to the TDM website.
*/


if (
url.origin !==
self.location.origin
) {
return;
}

/*

HTML pages use network first.

This allows GitHub Pages changes

to appear without waiting for

an old cached HTML file.
*/


if (
event.request.mode === "navigate" ||
url.pathname.endsWith(".html") ||
url.pathname === "/"
) {

event.respondWith(  

  fetch(event.request)  

    .then(response => {  

      if (response.ok) {  

        caches.open(CACHE_NAME)  
          .then(cache => {  

            cache.put(  
              event.request,  
              response.clone()  
            );  

          });  

      }  

      return response;  

    })  

    .catch(() => {  

      return caches  
        .match(event.request)  
        .then(cached => {  

          return (  
            cached ||  
            caches.match(  
              "./index.html"  
            )  
          );  

        });  

    })  

);  

return;

}

/*

Other files use cache first.
*/


event.respondWith(

caches  
  .match(event.request)  

  .then(cached => {  

    if (cached) {  
      return cached;  
    }  

    return fetch(event.request)  
      .then(response => {  

        if (response.ok) {  

          caches.open(CACHE_NAME)  
            .then(cache => {  

              cache.put(  
                event.request,  
                response.clone()  
              );  

            });  

        }  

        return response;  

      });  

  })

);

});
