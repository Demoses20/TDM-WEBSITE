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
  try{const ref=new URLSearchParams(location.search).get('ref');if(ref)localStorage.setItem('tdm_affiliate_ref',ref);}catch(e){}
document.addEventListener('DOMContentLoaded',()=>{markActiveNav();tdmUpdateCartBadges();});
  window.addEventListener('storage',()=>tdmUpdateCartBadges());
  window.addEventListener('pageshow',()=>tdmUpdateCartBadges());
})();
