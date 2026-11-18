/*
 * TDM Manufacturing - Web Push Notification Subscription
 *
 * This file only handles browser push subscription.
 * It does not replace app-common.js or service-worker.js.
 *
 * VAPID public key will be added in Step 3B.
 */

const TDM_VAPID_PUBLIC_KEY =
  "BAOnitz8dNFE1QYTB8_SdnMw2kuISrBlkaiY0-kSg1PlbhTJwFbySUP7TU7y0At1NuwwusVRwgDfHOC8AsVTTv8";

function tdmUrlBase64ToUint8Array(base64String) {
  const padding = "=".repeat(
    (4 - (base64String.length % 4)) % 4
  );

  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const rawData = atob(base64);

  return Uint8Array.from(
    [...rawData].map(char => char.charCodeAt(0))
  );
}

function tdmPushSupported() {
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

async function tdmGetPushSubscription() {
  if (!tdmPushSupported()) {
    throw new Error(
      "Push notifications are not supported by this browser."
    );
  }

  if (
    !TDM_VAPID_PUBLIC_KEY ||
    TDM_VAPID_PUBLIC_KEY ===
      "REPLACE_WITH_YOUR_VAPID_PUBLIC_KEY"
  ) {
    throw new Error(
      "VAPID public key has not been configured yet."
    );
  }

  const registration =
    await navigator.serviceWorker.ready;

  let subscription =
    await registration.pushManager.getSubscription();

  if (!subscription) {
    const permission =
      await Notification.requestPermission();

    if (permission !== "granted") {
      throw new Error(
        "Notification permission was not granted."
      );
    }

    subscription =
      await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey:
          tdmUrlBase64ToUint8Array(
            TDM_VAPID_PUBLIC_KEY
          )
      });
  }

  return subscription;
}

async function tdmSavePushSubscription() {
  const supabase = tdmGetSupabaseClient();

  const subscription =
    await tdmGetPushSubscription();

  const json = subscription.toJSON();

  if (
    !json.endpoint ||
    !json.keys?.p256dh ||
    !json.keys?.auth
  ) {
    throw new Error(
      "The browser returned an incomplete push subscription."
    );
  }

  let userId = null;

  try {
    const {
      data: { user }
    } = await supabase.auth.getUser();

    userId = user?.id || null;
  } catch (error) {
    console.warn(
      "Could not determine logged-in user:",
      error
    );
  }

  const { data, error } = await supabase.rpc(
  "save_push_subscription",
  {
    p_endpoint: json.endpoint,
    p_p256dh: json.keys.p256dh,
    p_auth: json.keys.auth
  }
);

if (error) {
  throw error;
}

  return {
    success: true,
    endpoint: json.endpoint
  };
}

async function tdmEnableNotifications() {
  try {
    const result =
      await tdmSavePushSubscription();

    console.log(
      "TDM push subscription saved.",
      result
    );

    return result;
  } catch (error) {
    console.error(
      "TDM push subscription failed:",
      error
    );

    return {
      success: false,
      error:
        error?.message ||
        String(error)
    };
  }
}

function tdmNotificationStatus() {
  if (!("Notification" in window)) {
    return "unsupported";
  }

  return Notification.permission;
}

/*
 * TDM notification opt-in popup.
 * The custom popup may appear automatically, but the browser's native
 * permission request is made only after the visitor taps Allow.
 * The PWA installation prompt is handled separately by pwa-install.js.
 */
(function tdmNotificationOptInPopup() {
  const DISMISSED_KEY = "tdm_notification_prompt_dismissed_session";

  function addPopupStyles() {
    if (document.getElementById("tdmNotificationPopupStyles")) return;

    const style = document.createElement("style");
    style.id = "tdmNotificationPopupStyles";
    style.textContent = `
      #tdmNotificationPopup {
        position: fixed;
        inset: 0;
        z-index: 1000000;
        display: none;
        align-items: center;
        justify-content: center;
        padding: 22px;
        background: rgba(0, 0, 0, .62);
        font-family: Arial, sans-serif;
      }
      #tdmNotificationPopup.tdm-notification-visible { display: flex; }
      .tdm-notification-card {
        width: 100%;
        max-width: 390px;
        padding: 25px 22px 21px;
        border: 2px solid #f97316;
        border-radius: 22px;
        background: #fff;
        color: #292929;
        text-align: center;
        box-shadow: 0 18px 55px rgba(0,0,0,.3);
      }
      .tdm-notification-symbol {
        width: 58px;
        height: 58px;
        display: grid;
        place-items: center;
        margin: 0 auto 12px;
        border-radius: 18px;
        background: #fff0e5;
        font-size: 30px;
      }
      .tdm-notification-card h2 {
        margin: 0 0 9px;
        color: #7c2d12;
        font-size: 21px;
        line-height: 1.25;
      }
      .tdm-notification-card p {
        margin: 0 0 17px;
        color: #555;
        font-size: 14px;
        line-height: 1.55;
      }
      #tdmNotificationAllow {
        width: 100%;
        min-height: 48px;
        border: 0;
        border-radius: 13px;
        background: #f97316;
        color: #fff;
        font-size: 16px;
        font-weight: 800;
        cursor: pointer;
      }
      #tdmNotificationAllow:disabled { opacity: .65; cursor: wait; }
      #tdmNotificationLater {
        margin-top: 10px;
        padding: 10px 14px;
        border: 0;
        background: transparent;
        color: #666;
        font-size: 14px;
        cursor: pointer;
      }
      #tdmNotificationMessage {
        min-height: 18px;
        margin-top: 10px;
        color: #9a3412;
        font-size: 12px;
        line-height: 1.4;
      }
    `;
    document.head.appendChild(style);
  }

  function createPopup() {
    if (document.getElementById("tdmNotificationPopup")) return;

    const popup = document.createElement("div");
    popup.id = "tdmNotificationPopup";
    popup.setAttribute("role", "dialog");
    popup.setAttribute("aria-modal", "true");
    popup.setAttribute("aria-labelledby", "tdmNotificationTitle");
    popup.innerHTML = `
      <div class="tdm-notification-card">
        <div class="tdm-notification-symbol" aria-hidden="true">🔔</div>
        <h2 id="tdmNotificationTitle">Stay updated with TDM STORE</h2>
        <p id="tdmNotificationDescription">Allow notifications to hear about new equipment, product updates and important store announcements.</p>
        <button id="tdmNotificationAllow" type="button">Allow Notifications</button>
        <button id="tdmNotificationLater" type="button">Not now</button>
        <div id="tdmNotificationMessage" role="status" aria-live="polite"></div>
      </div>
    `;
    document.body.appendChild(popup);

    const allowButton = popup.querySelector("#tdmNotificationAllow");
    const laterButton = popup.querySelector("#tdmNotificationLater");
    const description = popup.querySelector("#tdmNotificationDescription");
    const message = popup.querySelector("#tdmNotificationMessage");

    if (Notification.permission === "denied") {
      description.textContent = "Notifications are currently blocked for this site. Change this site's notification permission in your browser or app settings, then reopen TDM STORE.";
      allowButton.textContent = "Notifications are blocked";
      allowButton.disabled = true;
    }

    laterButton.addEventListener("click", function () {
      try { sessionStorage.setItem(DISMISSED_KEY, "1"); } catch (_) {}
      popup.classList.remove("tdm-notification-visible");
    });

    allowButton.addEventListener("click", async function () {
      if (Notification.permission === "denied") return;

      allowButton.disabled = true;
      allowButton.textContent = "Enabling...";
      message.textContent = "";

      const result = await tdmEnableNotifications();

      if (result && result.success && Notification.permission === "granted") {
        popup.classList.remove("tdm-notification-visible");
        try { sessionStorage.setItem(DISMISSED_KEY, "1"); } catch (_) {}
        return;
      }

      allowButton.disabled = false;
      allowButton.textContent = "Try Again";
      message.textContent = result?.error || "Notifications could not be enabled. Please try again.";
    });
  }

  function showIfNeeded() {
    if (!tdmPushSupported()) return;
    if (Notification.permission === "granted") return;

    try {
      if (sessionStorage.getItem(DISMISSED_KEY) === "1") return;
    } catch (_) {}

    addPopupStyles();
    createPopup();
    window.setTimeout(function () {
      const popup = document.getElementById("tdmNotificationPopup");
      if (popup && Notification.permission !== "granted") {
        popup.classList.add("tdm-notification-visible");
      }
    }, 900);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", showIfNeeded, { once: true });
  } else {
    showIfNeeded();
  }
})();

