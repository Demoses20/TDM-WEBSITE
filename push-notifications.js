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

  const { error } = await supabase
    .from("push_subscriptions")
    .upsert(
      {
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        user_id: userId,
        updated_at: new Date().toISOString()
      },
      {
        onConflict: "endpoint"
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

    alert(
      "Notifications could not be enabled: " +
        (error?.message ||
          "Unknown error")
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
