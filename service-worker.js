const CACHE_NAME = "tdm-app-v12-11-push-click";

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

  /*
   * Immediately activate the new service worker.
   */
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
    ).then(() => self.clients.claim())
  );
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

      /*
       * IMPORTANT:
       * Accept both URL names sent by send-push.
       */
      const targetUrl =
        data.url ||
        data.product_url ||
        "https://www.tdmmanufacturing.com/";

      const tag =
        data.tag ||
        "tdm-new-product";

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

        /*
         * EVERYTHING needed when notification
         * is clicked is stored here.
         */
        data: {
          url: targetUrl,
          product_url: targetUrl,
          productName: productName,
          product_name: productName
        },

        tag: tag,

        renotify: true,

        requireInteraction: false
      };

      /*
       * Large notification image.
       */
      if (image) {
        notificationOptions.image = image;
      }

      console.log(
        "TDM push notification URL:",
        targetUrl
      );

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

    /*
     * Read the URL stored inside the notification.
     */
    const notificationData =
      event.notification &&
      event.notification.data
        ? event.notification.data
        : {};

    const targetUrl =
      notificationData.url ||
      notificationData.product_url ||
      "https://www.tdmmanufacturing.com/";

    console.log(
      "TDM notification clicked:",
      targetUrl
    );

    event.waitUntil(

      (async () => {

        /*
         * Find currently open TDM windows/tabs.
         */
        const windowClients =
          await clients.matchAll({
            type: "window",
            includeUncontrolled: true
          });

        /*
         * Try an existing TDM window first.
         */
        for (const client of windowClients) {

          try {

            const clientUrl =
              new URL(client.url);

            const target =
              new URL(targetUrl);

            /*
             * Only reuse a TDM Manufacturing
             * window/tab.
             */
            if (
              clientUrl.origin ===
              target.origin
            ) {

              try {

                await client.focus();

                /*
                 * Navigate the existing window
                 * to the product URL.
                 */
                await client.navigate(
                  target.href
                );

                return;

              } catch (navigateError) {

                console.warn(
                  "TDM existing-window navigation failed:",
                  navigateError
                );

                /*
                 * Continue below and open the
                 * URL in a new window/tab.
                 */
              }
            }

          } catch (error) {

            console.warn(
              "TDM notification client check failed:",
              error
            );

          }
        }

        /*
         * If there is no usable existing window,
         * open the exact product URL.
         */
        try {

          await clients.openWindow(
            targetUrl
          );

        } catch (openError) {

          console.error(
            "TDM notification openWindow failed:",
            openError
          );

        }

      })()

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
     * Reserved for future analytics.
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
   * Only handle requests belonging
   * to the TDM website.
   */
  if (
    url.origin !==
    self.location.origin
  ) {
    return;
  }

  /*
   * HTML pages:
   * NETWORK FIRST
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
   * Other files:
   * CACHE FIRST
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
