(function(){
  const SUPABASE_URL = "https://ctdmpigyhinaqpicbycq.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_YUn4pQIhl7S6OJ1SBnYqg_NATcZhsm";
  window.TDM_SUPABASE_URL = SUPABASE_URL;
  window.TDM_SUPABASE_PUBLISHABLE_KEY = SUPABASE_PUBLISHABLE_KEY;
  window.tdmCartKey = userId => `tdm_cart_${userId || 'guest'}`;
  window.tdmReadCart = userId => { try { return JSON.parse(localStorage.getItem(tdmCartKey(userId)) || '[]'); } catch(e){ return []; } };
  window.tdmWriteCart = (cart,userId) => localStorage.setItem(tdmCartKey(userId), JSON.stringify(cart));
  window.tdmCartCount = cart => cart.reduce((n,i)=>n+(Number(i.quantity)||0),0);
  window.tdmParseMedia = function(product){
    const raw=product?.image_url ?? product?.image ?? '';
    if(Array.isArray(raw)) return raw;
    if(typeof raw==='string' && raw.trim().startsWith('[')){ try { const x=JSON.parse(raw); if(Array.isArray(x)) return x; } catch(e){} }
    return raw ? [raw] : [];
  };
  window.tdmProductImage = function(product){ return (tdmParseMedia(product)[0]) || 'logo.png'; };
  window.tdmNav = function(active){
    return `<nav class="app-bottom-nav" aria-label="Main app navigation">
      <a href="index.html" data-nav="home" class="${active==='home'?'active':''}"><span class="nav-icon">⌂</span><span>Home</span></a>
      <a href="product.html" data-nav="store" class="${active==='store'?'active':''}"><span class="nav-icon">▦</span><span>Store</span></a>
      <a href="service.html" data-nav="service" class="${active==='service'?'active':''}"><span class="nav-icon">⚙</span><span>Service</span></a>
      <a href="account.html" data-nav="account" class="${active==='account'?'active':''}"><span class="nav-icon">♙</span><span>Account</span></a>
    </nav>`;
  };
  window.tdmInjectNav = function(active){ document.body.insertAdjacentHTML('beforeend',tdmNav(active)); };
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
