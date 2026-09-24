/* TDM customer account helpers */
(function(){
  const SUPABASE_URL = "https://ctdmpigyhinaqpicbycq.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_YUn4pQIhl7S6OJ1SBnYqg_NATcZhsm";
  window.TDM_CUSTOMER_CONFIG={SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY};
  window.tdmCustomerClient=function(){
    if(!window.supabase) throw new Error('Supabase library did not load.');
    if(!window.__tdmCustomerClient) window.__tdmCustomerClient=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
    return window.__tdmCustomerClient;
  };
  window.tdmEsc=function(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));};
  window.tdmMoney=function(v){return '₦'+Number(v||0).toLocaleString();};
  window.tdmRequireUser=async function(){
    const c=tdmCustomerClient(); const {data:{user}}=await c.auth.getUser();
    if(!user){location.href='auth.html';return null;} return user;
  };
  window.tdmGetProfile=async function(user){
    const c=tdmCustomerClient(); let row=null;
    try{const r=await c.from('Customers').select('*').eq('id',user.id).maybeSingle(); row=r.data||null;}catch(e){}
    const m=user.user_metadata||{};
    return {user, row, name:row?.full_name||m.full_name||[m.surname,m.first_name].filter(Boolean).join(' ')||'Customer', email:row?.email||user.email||m.email||'', phone:row?.phone||m.phone||user.phone||'', home_address:row?.home_address||m.home_address||'', delivery_address:row?.delivery_address||m.delivery_address||m.address||''};
  };
  window.tdmSignOut=async function(){await tdmCustomerClient().auth.signOut();location.href='auth.html';};
})();
