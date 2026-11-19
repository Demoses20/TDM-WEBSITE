(function () {
  "use strict";

  const STORAGE_KEY = "tdm_notification_popup_choice";

  function isNativeApp() {
    return Boolean(
      window.TDMNativePush &&
      window.TDMNativePush.isNative === true
    );
  }

  function addPopup() {
    if (document.getElementById("tdmNotificationPopup")) return;

    if (localStorage.getItem(STORAGE_KEY) === "enabled" ||
        localStorage.getItem(STORAGE_KEY) === "later") {
      return;
    }

    // Do not show the native popup until its Firebase module is available.
    if (window.Capacitor?.isNativePlatform?.() && !isNativeApp()) {
      console.warn("TDM native messaging module is not loaded.");
      return;
    }

    const style = document.createElement("style");
    style.textContent = `
      #tdmNotificationPopup {
        position: fixed;
        inset: 0;
        z-index: 999999;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
        background: rgba(0,0,0,.65);
      }
      #tdmNotificationPopup .tdm-popup-card {
        width: min(390px, 100%);
        padding: 26px 22px;
        border-radius: 25px;
        background: #fff;
        color: #111827;
        text-align: center;
        box-shadow: 0 20px 60px rgba(0,0,0,.3);
        font-family: Arial, sans-serif;
      }
      #tdmNotificationPopup h2 {
        margin: 0 0 10px;
        font-size: 23px;
      }
      #tdmNotificationPopup p {
        color: #6b7280;
        line-height: 1.55;
        margin: 0 0 18px;
      }
      #tdmNotificationPopup .tdm-popup-enable {
        width: 100%;
        padding: 15px;
        border: 0;
        border-radius: 14px;
        background: #f97316;
        color: white;
        font-size: 16px;
        font-weight: 900;
      }
      #tdmNotificationPopup .tdm-popup-later {
        margin-top: 14px;
        padding: 10px;
        border: 0;
        background: transparent;
        color: #9a3412;
        font-weight: 800;
      }
      #tdmNotificationPopup button:disabled {
        opacity: .6;
      }
    `;
    document.head.appendChild(style);

    const popup = document.createElement("div");
    popup.id = "tdmNotificationPopup";

    popup.innerHTML = `
      <section class="tdm-popup-card" role="dialog"
        aria-modal="true" aria-labelledby="tdmPopupTitle">
        <div style="font-size:42px;margin-bottom:12px">🔔</div>
        <h2 id="tdmPopupTitle">Stay Updated with TDM!</h2>
        <p>
          Receive important updates about your orders, payments,
          new products, promotions and services.
        </p>
        <button class="tdm-popup-enable" type="button">
          Enable Notifications
        </button>
        <br>
        <button class="tdm-popup-later" type="button">
          Maybe later
        </button>
        <div class="tdm-popup-message"
          role="status" style="font-size:13px;margin-top:10px"></div>
      </section>
    `;

    document.body.appendChild(popup);

    const enable = popup.querySelector(".tdm-popup-enable");
    const later = popup.querySelector(".tdm-popup-later");
    const message = popup.querySelector(".tdm-popup-message");

    later.addEventListener("click", () => {
      localStorage.setItem(STORAGE_KEY, "later");
      popup.remove();
    });

    enable.addEventListener("click", async () => {
      enable.disabled = true;
      message.textContent = "Enabling notifications...";

      try {
        if (isNativeApp()) {
          const result =
            await window.TDMNativePush.enableFromPopup();

          if (!result || result.permission !== "granted") {
            throw new Error("Notification permission was not granted.");
          }
        } else {
          if (typeof window.tdmEnableNotifications !== "function") {
            throw new Error("Website notification service is unavailable.");
          }

          const result = await window.tdmEnableNotifications();

          if (!result || !result.success) {
            throw new Error(
              result?.error || "Could not enable notifications."
            );
          }
        }

        localStorage.setItem(STORAGE_KEY, "enabled");
        message.textContent = "Notifications enabled successfully.";

        setTimeout(() => popup.remove(), 900);
      } catch (error) {
        message.textContent =
          error?.message || "Could not enable notifications.";
        enable.disabled = false;
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", addPopup);
  } else {
    addPopup();
  }
})();
