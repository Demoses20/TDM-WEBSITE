/* TDM app-wide Supabase, session and cart helpers */
(function(){
  const SUPABASE_URL = "https://ctdmpigyhinaqpicbycq.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_YNun4pQIhl7S6OJ1SBnYqg_NATcZhsm";
  const AUTH_OPTIONS = {auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storageKey:'tdm-supabase-auth',flowType:'pkce'}};
  window.TDM_SUPABASE_URL = SUPABASE_URL;
  window.TDM_SUPABASE_PUBLISHABLE_KEY = SUPABASE_PUBLISHABLE_KEY;
  window.tdmGetSupabaseClient = function(){
    if(!window.supabase) throw new Error('Supabase library did not load.');
    if(!window.__tdmAppClient) window.__tdmAppClient=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,AUTH_OPTIONS);
    return window.__tdmAppClient;
  };
  window.tdmCartKey = userId => `tdm_cart_${userId || 'guest'}`;
  window.tdmReadCart = userId => { try { return JSON.parse(localStorage.getItem(tdmCartKey(userId)) || '[]'); } catch(e){ return []; } };
  window.tdmWriteCart = (cart,userId) => localStorage.setItem(tdmCartKey(userId), JSON.stringify(cart));
  window.tdmCartCount = cart => (Array.isArray(cart)?cart:[]).reduce((n,i)=>n+(Number(i.quantity)||0),0);
  window.tdmUpdateCartBadges = async function(){
    let userId=null;
    try{ const c=tdmGetSupabaseClient(); const {data:{session}}=await c.auth.getSession(); userId=session?.user?.id||null; }catch(e){}
    const n=tdmCartCount(tdmReadCart(userId));
    document.querySelectorAll('#cartCountBottom,.cart-count').forEach(el=>el.textContent=String(n));
  };
  window.tdmRequireCustomer = async function(returnPage){
    try{
      const c=tdmGetSupabaseClient();
      const {data:{session}}=await c.auth.getSession();
      const user=session?.user||null;
      if(!user){ sessionStorage.setItem('tdm_return_after_login',returnPage||location.pathname.split('/').pop()||'index.html'); location.replace('auth.html'); return null; }
      return user;
    }catch(e){ console.error(e); return null; }
  };
  function markActiveNav(){
    const page=(location.pathname.split('/').pop()||'index.html').toLowerCase();
    document.querySelectorAll('.bottom-nav a').forEach(a=>{
      const target=(a.getAttribute('href')||'').split('?')[0].split('/').pop().toLowerCase();
      a.classList.toggle('active',target===page || (page===''&&target==='index.html'));
    });
  }
    /* =========================================
     TDM PWA INSTALL PROMPT
     ========================================= */

  let tdmDeferredInstallPrompt = null;

  function tdmIsAppInstalled() {
    return (
      window.matchMedia &&
      window.matchMedia('(display-mode: standalone)').matches
    ) || window.navigator.standalone === true;
  }

  function tdmCreateInstallPrompt() {
    if (document.getElementById('tdmInstallPrompt')) {
      return;
    }

    const prompt = document.createElement('div');

    prompt.id = 'tdmInstallPrompt';

    prompt.innerHTML = `
      <div class="tdm-install-box">
        <div class="tdm-install-icon">📲</div>

        <div class="tdm-install-content">
          <strong>Install TDM App</strong>
          <span>
            Install TDM Manufacturing for faster access.
          </span>
        </div>

        <button id="tdmInstallButton" type="button">
          Install
        </button>

        <button
          id="tdmInstallClose"
          type="button"
          aria-label="Close"
        >
          ×
        </button>
      </div>
    `;

    document.body.appendChild(prompt);

    const installButton =
      document.getElementById('tdmInstallButton');

    const closeButton =
      document.getElementById('tdmInstallClose');

    installButton.addEventListener('click', async () => {
      if (!tdmDeferredInstallPrompt) {
        prompt.remove();
        return;
      }

      const installEvent = tdmDeferredInstallPrompt;

      tdmDeferredInstallPrompt = null;

      prompt.remove();

      try {
        await installEvent.prompt();

        const result =
          await installEvent.userChoice;

        console.log(
          'TDM install choice:',
          result.outcome
        );
      } catch (error) {
        console.error(
          'TDM app installation failed:',
          error
        );
      }
    });

    closeButton.addEventListener('click', () => {
      prompt.remove();

      localStorage.setItem(
        'tdm_install_prompt_closed',
        'true'
      );
    });
  }

  function tdmShowInstallPrompt() {
    if (tdmIsAppInstalled()) {
      return;
    }

    if (!tdmDeferredInstallPrompt) {
      return;
    }

    /*
     * Don't repeatedly bother the same visitor
     * after they have closed the prompt.
     */
    if (
      localStorage.getItem(
        'tdm_install_prompt_closed'
      ) === 'true'
    ) {
      return;
    }

    tdmCreateInstallPrompt();
  }

  /*
   * Chrome/Android fires this when the website
   * meets the PWA installation requirements.
   */
  window.addEventListener(
    'beforeinstallprompt',
    event => {
      event.preventDefault();

      tdmDeferredInstallPrompt = event;

      /*
       * Wait until the page is visible before
       * displaying our own TDM install prompt.
       */
      if (document.readyState === 'loading') {
        document.addEventListener(
          'DOMContentLoaded',
          () => {
            setTimeout(
              tdmShowInstallPrompt,
              1200
            );
          },
          { once: true }
        );
      } else {
        setTimeout(
          tdmShowInstallPrompt,
          1200
        );
      }
    }
  );

  /*
   * When the app is successfully installed,
   * remove our custom prompt.
   */
  window.addEventListener(
    'appinstalled',
    () => {
      tdmDeferredInstallPrompt = null;

      const prompt =
        document.getElementById(
          'tdmInstallPrompt'
        );

      if (prompt) {
        prompt.remove();
      }

      localStorage.setItem(
        'tdm_app_installed',
        'true'
      );

      console.log(
        'TDM Manufacturing app installed.'
      );
    }
  );

  /*
   * Install prompt styling
   */
  const tdmInstallStyle =
    document.createElement('style');

  tdmInstallStyle.textContent = `
    #tdmInstallPrompt {
      position: fixed;
      left: 16px;
      right: 16px;
      bottom: 92px;
      z-index: 999999;
      font-family: Arial, sans-serif;
    }

    .tdm-install-box {
      position: relative;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 15px;
      background: #ffffff;
      border: 2px solid #f47b20;
      border-radius: 18px;
      box-shadow: 0 8px 30px rgba(0,0,0,0.25);
    }

    .tdm-install-icon {
      width: 45px;
      height: 45px;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #f47b20;
      border-radius: 12px;
      font-size: 24px;
    }

    .tdm-install-content {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .tdm-install-content strong {
      color: #222222;
      font-size: 16px;
    }

    .tdm-install-content span {
      color: #666666;
      font-size: 12px;
      line-height: 1.3;
    }

    #tdmInstallButton {
      border: 0;
      padding: 11px 15px;
      border-radius: 12px;
      background: #f47b20;
      color: #ffffff;
      font-weight: 700;
      font-size: 14px;
      cursor: pointer;
    }

    #tdmInstallClose {
      position: absolute;
      top: -9px;
      right: -7px;
      width: 25px;
      height: 25px;
      border: 0;
      border-radius: 50%;
      background: #333333;
      color: #ffffff;
      font-size: 18px;
      line-height: 25px;
      cursor: pointer;
    }

    @media (max-width: 420px) {
      .tdm-install-box {
        padding: 12px;
        gap: 9px;
      }

      .tdm-install-icon {
        width: 40px;
        height: 40px;
        font-size: 20px;
      }

      .tdm-install-content strong {
        font-size: 14px;
      }

      .tdm-install-content span {
        font-size: 11px;
      }

      #tdmInstallButton {
        padding: 10px 12px;
        font-size: 13px;
      }
    }
  `;

  document.head.appendChild(tdmInstallStyle);
  try{const ref=new URLSearchParams(location.search).get('ref');if(ref)localStorage.setItem('tdm_affiliate_ref',ref);}catch(e){}
document.addEventListener('DOMContentLoaded',()=>{markActiveNav();tdmUpdateCartBadges();});
  window.addEventListener('storage',()=>tdmUpdateCartBadges());
  window.addEventListener('pageshow',()=>tdmUpdateCartBadges());
})();
