/* TDM PWA install support */
(function () {
  "use strict";

  const SW_URL = "./service-worker.js";
  let deferredInstallPrompt = null;
  let promptVisible = false;

  function isInstalled() {
    return (
      (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
      window.navigator.standalone === true
    );
  }

  function hidePrompt() {
    const el = document.getElementById("tdmInstallPrompt");
    if (el) el.remove();
    promptVisible = false;
  }

  function createPrompt() {
    if (isInstalled() || !deferredInstallPrompt || promptVisible) return;
    if (!document.body) {
      window.addEventListener("DOMContentLoaded", createPrompt, { once: true });
      return;
    }

    const prompt = document.createElement("div");
    prompt.id = "tdmInstallPrompt";
    prompt.innerHTML = `
      <div class="tdm-install-box" role="dialog" aria-label="Install TDM App">
        <div class="tdm-install-icon" aria-hidden="true">📲</div>
        <div class="tdm-install-content">
          <strong>Install TDM App</strong>
          <span>Install TDM Manufacturing for faster access.</span>
        </div>
        <button id="tdmInstallButton" type="button">Install</button>
        <button id="tdmInstallClose" type="button" aria-label="Close">×</button>
      </div>
    `;

    document.body.appendChild(prompt);
    promptVisible = true;

    document.getElementById("tdmInstallButton").addEventListener("click", async function () {
      const installEvent = deferredInstallPrompt;
      if (!installEvent) {
        hidePrompt();
        return;
      }

      deferredInstallPrompt = null;
      hidePrompt();

      try {
        await installEvent.prompt();
        const result = await installEvent.userChoice;
        console.log("TDM install choice:", result && result.outcome);
      } catch (error) {
        console.error("TDM app installation failed:", error);
      }
    });

    document.getElementById("tdmInstallClose").addEventListener("click", function () {
      hidePrompt();
      // Only suppress it for this page visit. A fresh page can show it again.
      sessionStorage.setItem("tdm_install_prompt_closed", "true");
    });
  }

  function showPromptSoon() {
    if (sessionStorage.getItem("tdm_install_prompt_closed") === "true") return;
    window.setTimeout(createPrompt, 700);
  }

  window.addEventListener("beforeinstallprompt", function (event) {
    event.preventDefault();
    deferredInstallPrompt = event;
    showPromptSoon();
    console.log("TDM PWA install prompt is available.");
  });

  window.addEventListener("appinstalled", function () {
    deferredInstallPrompt = null;
    hidePrompt();
    console.log("TDM Manufacturing app installed.");
  });

  // Register the service worker on every customer-facing page.
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register(SW_URL, { scope: "./" })
        .then(function (registration) {
          console.log("TDM service worker registered:", registration.scope);
        })
        .catch(function (error) {
          console.error("TDM service worker registration failed:", error);
        });
    });
  }

  const style = document.createElement("style");
  style.textContent = `
    #tdmInstallPrompt {
      position: fixed;
      left: 12px;
      right: 12px;
      bottom: 92px;
      z-index: 999999;
      font-family: Arial, sans-serif;
    }
    .tdm-install-box {
      position: relative;
      display: flex;
      align-items: center;
      gap: 10px;
      max-width: 720px;
      margin: 0 auto;
      padding: 13px;
      background: #fff;
      border: 2px solid #f97316;
      border-radius: 18px;
      box-shadow: 0 10px 30px rgba(0,0,0,.22);
    }
    .tdm-install-icon {
      width: 43px;
      height: 43px;
      flex: 0 0 43px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #f97316;
      color: #fff;
      border-radius: 12px;
      font-size: 23px;
    }
    .tdm-install-content {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .tdm-install-content strong {
      color: #7c2d12;
      font-size: 15px;
    }
    .tdm-install-content span {
      color: #666;
      font-size: 12px;
      line-height: 1.3;
    }
    #tdmInstallButton {
      border: 0;
      padding: 11px 15px;
      border-radius: 11px;
      background: #f97316;
      color: #fff;
      font-weight: 800;
      font-size: 14px;
      cursor: pointer;
      white-space: nowrap;
    }
    #tdmInstallClose {
      position: absolute;
      top: -9px;
      right: -7px;
      width: 25px;
      height: 25px;
      border: 0;
      border-radius: 50%;
      background: #333;
      color: #fff;
      font-size: 18px;
      line-height: 25px;
      cursor: pointer;
    }
    @media (max-width: 420px) {
      #tdmInstallPrompt { bottom: 94px; }
      .tdm-install-box { padding: 11px; gap: 8px; }
      .tdm-install-icon { width: 38px; height: 38px; flex-basis: 38px; font-size: 20px; }
      .tdm-install-content strong { font-size: 14px; }
      .tdm-install-content span { font-size: 11px; }
      #tdmInstallButton { padding: 10px 12px; font-size: 13px; }
    }
  `;
  document.head.appendChild(style);
})();
