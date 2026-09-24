(function(){
  const SUPABASE_URL = "https://ctdmpigyhinaqpicbycq.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_YUn4pQIhl7S6OJ1SBnYqg_NATcZhsm";
  window.TDM_SUPABASE_URL = SUPABASE_URL;
  window.TDM_SUPABASE_PUBLISHABLE_KEY = SUPABASE_PUBLISHABLE_KEY;
  window.tdmCartKey = userId => `tdm_cart_${userId || 'guest'}`;
  window.tdmReadCart = userId => { try { return JSON.parse(localStorage.getItem(tdmCartKey(userId)) || '[]'); } catch(e){ return []; } };
  window.tdmWriteCart = (cart,userId) => localStorage.setItem(tdmCartKey(userId), JSON.stringify(cart));
  window.tdmCartCount = cart => cart.reduce((n,i)=>n+(Number(i.quantity)||0),0);
  window.tdmUpdateCartBadges = async function(){
    let userId = null;
    try { if(window.supabase && window.supabase.createClient){ const c=window.tdmSupabaseClient || window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}}); window.tdmSupabaseClient=c; const r=await c.auth.getUser(); userId=r.data.user?.id||null; } } catch(e){}
    const n=tdmCartCount(tdmReadCart(userId));
    document.querySelectorAll('#cartCountBottom').forEach(el=>el.textContent=n);
  };
  window.tdmRequireCustomer = async function(returnPage){
    try{
      const c=window.tdmSupabaseClient || (window.supabase&&window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}}));
      if(!c) return null;
      window.tdmSupabaseClient=c;
      const {data:{user}}=await c.auth.getUser();
      if(!user){ sessionStorage.setItem('tdm_return_after_login',returnPage||location.pathname.split('/').pop()||'index.html'); location.href='account.html?login=required'; return null; }
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
  document.addEventListener('DOMContentLoaded',()=>{markActiveNav();tdmUpdateCartBadges();});
  window.addEventListener('storage',()=>tdmUpdateCartBadges());
})();
