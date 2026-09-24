/* TDM Manufacturing authentication helpers */
(function(){
  const SUPABASE_URL = "https://ctdmpigyhinaqpicbycq.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_YUn4pQIhl7S6OJ1SBnYqg_NATcZhsm";
  window.TDM_AUTH_CONFIG = { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY };
  window.tdmAuthClient = function(){
    if(!window.supabase) throw new Error('Supabase library did not load.');
    if(!window.__tdmAuthClient){
      window.__tdmAuthClient = window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
    }
    return window.__tdmAuthClient;
  };
  window.tdmAuthReturnPage = function(){
    return sessionStorage.getItem('tdm_return_after_login') || 'index.html';
  };
  window.tdmFinishLogin = function(){
    const page = window.tdmAuthReturnPage();
    sessionStorage.removeItem('tdm_return_after_login');
    location.href = page;
  };
})();
