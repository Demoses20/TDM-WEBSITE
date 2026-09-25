/* TDM Manufacturing admin authentication/shared helpers */
(function(){
  const ADMIN_EMAIL='technicaldemoses@gmail.com';
  const client=()=>window.tdmGetSupabaseClient();
  window.TDM_ADMIN_EMAIL=ADMIN_EMAIL;
  window.tdmAdminClient=client;
  window.tdmAdminIsUser=async function(){
    const {data:{session}}=await client().auth.getSession();
    return session?.user && String(session.user.email||'').toLowerCase()===ADMIN_EMAIL;
  };
  window.tdmAdminRequire=async function(){
    const ok=await tdmAdminIsUser();
    if(!ok){
      const next=location.pathname.split('/').pop()||'admin-dashboard.html';
      location.replace('admin-dashboard.html?login=required&next='+encodeURIComponent(next));
      return null;
    }
    return (await client().auth.getSession()).data.session.user;
  };
  window.tdmAdminLogout=async function(){await client().auth.signOut();location.replace('admin-dashboard.html');};
  window.tdmAdminEsc=function(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));};
  window.tdmAdminMoney=function(v){return '₦'+Number(v||0).toLocaleString();};
  window.tdmAdminSet=function(id,v){const e=document.getElementById(id);if(e)e.value=v??'';};
})();
