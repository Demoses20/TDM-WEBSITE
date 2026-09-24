/* TDM customer account helpers */
(function(){
  const SUPABASE_URL = "https://ctdmpigyhinaqpicbycq.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_YNun4pQIhl7S6OJ1SBnYqg_NATcZhsm";
  const AUTH_OPTIONS = {auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storageKey:'tdm-supabase-auth',flowType:'pkce'}};
  window.TDM_CUSTOMER_CONFIG={SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY};
  window.tdmCustomerClient=function(){
    if(!window.supabase) throw new Error('Supabase library did not load.');
    if(!window.__tdmCustomerClient) window.__tdmCustomerClient=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,AUTH_OPTIONS);
    return window.__tdmCustomerClient;
  };
  window.tdmEsc=function(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));};
  window.tdmMoney=function(v){return '₦'+Number(v||0).toLocaleString();};
  window.tdmRequireUser=async function(returnPage){
    const c=tdmCustomerClient();
    const {data:{session}}=await c.auth.getSession();
    const user=session?.user||null;
    if(!user){
      sessionStorage.setItem('tdm_return_after_login',returnPage||location.pathname.split('/').pop()||'index.html');
      location.replace('auth.html');
      return null;
    }
    return user;
  };
  window.tdmGetProfile=async function(user){
    const c=tdmCustomerClient(); let row=null;
    try{const r=await c.from('Customers').select('*').eq('id',user.id).maybeSingle(); row=r.data||null;}catch(e){console.warn('Customer profile read:',e.message)}
    const m=user.user_metadata||{};
    return {user,row,name:row?.full_name||m.full_name||[m.surname,m.first_name].filter(Boolean).join(' ')||'Customer',email:row?.email||user.email||m.email||'',phone:row?.phone||m.phone||user.phone||'',home_address:row?.home_address||m.home_address||'',delivery_address:row?.delivery_address||m.delivery_address||m.address||'',avatar_url:row?.avatar_url||m.avatar_url||m.profile_picture||''};
  };
  // Cart helpers are kept here too so every customer-account page can use the
  // same cart without depending on app-common.js being loaded first.
  window.tdmCartKey = function(userId){ return `tdm_cart_${userId || 'guest'}`; };
  window.tdmReadCart = function(userId){
    try { return JSON.parse(localStorage.getItem(window.tdmCartKey(userId)) || '[]'); }
    catch(e) { return []; }
  };
  window.tdmWriteCart = function(cart,userId){
    localStorage.setItem(window.tdmCartKey(userId), JSON.stringify(Array.isArray(cart)?cart:[]));
  };
  window.tdmCartCount = function(cart){
    return (Array.isArray(cart)?cart:[]).reduce((n,i)=>n+(Number(i.quantity)||0),0);
  };
  window.tdmUpdateCartBadges = async function(){
    try{
      const {data:{session}} = await tdmCustomerClient().auth.getSession();
      const userId = session?.user?.id || null;
      const count = tdmCartCount(tdmReadCart(userId));
      document.querySelectorAll('#cartCountBottom,.cart-count').forEach(el=>el.textContent=String(count));
    }catch(e){}
  };
  window.tdmSignOut=async function(){
    try{ await tdmCustomerClient().auth.signOut(); }catch(e){}
    localStorage.removeItem('tdm-supabase-auth');
    location.replace('auth.html');
  };
  document.addEventListener('DOMContentLoaded', tdmUpdateCartBadges);
  window.addEventListener('pageshow', tdmUpdateCartBadges);
})();
