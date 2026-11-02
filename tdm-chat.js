/* TDM chat v3: one admin profile per customer, selectable enquiries, incremental updates. */
(() => {
  'use strict';
  const ADMIN_EMAIL='technicaldemoses@gmail.com', BUCKET='tdm-chat-media';
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const params=new URLSearchParams(location.search), isAdmin=location.pathname.toLowerCase().endsWith('admin-inbox.html');
  let client,user,current=null,threads=[],selectedCustomer=null,recorder=null,recordChunks=[],recording=false,chosenFile=null,sessionToken=null;
  let renderedIds=new Set(),lastMessageTime=null,refreshBusy=false;
  const adminName='TDM Support';
  function status(t){const el=$('chatStatus');if(el)el.textContent=t;}
  function formatDate(v){try{return v?new Date(v).toLocaleString():''}catch(_){return '';}}
  function isAdminUser(){return String(user?.email||'').toLowerCase()===ADMIN_EMAIL;}
  async function getToken(){const {data,error}=await client.auth.getSession();if(error)throw error;sessionToken=data.session?.access_token||sessionToken;if(!sessionToken)throw new Error('Your login session has expired. Please sign in again.');return sessionToken;}
  async function restInsertMessage(payload){
    const token=await getToken(), response=await fetch(window.TDM_SUPABASE_URL+'/rest/v1/tdm_messages',{method:'POST',headers:{apikey:window.TDM_SUPABASE_PUBLISHABLE_KEY,Authorization:'Bearer '+token,'Content-Type':'application/json','Accept':'application/json','Prefer':'return=representation'},body:JSON.stringify(payload)});
    const raw=await response.text();let data=null;try{data=raw?JSON.parse(raw):null;}catch(_){}
    if(!response.ok)throw new Error(data?.message||data?.hint||raw||`Message request failed (${response.status})`);return data;
  }
  async function init(){
    try{
      client=tdmGetSupabaseClient();const {data,error}=await client.auth.getSession();if(error)throw error;
      user=data.session?.user;sessionToken=data.session?.access_token||null;
      if(!user){sessionStorage.setItem('tdm_return_after_login',(location.pathname.split('/').pop()||'chat.html')+location.search);location.replace('auth.html');return;}
      if(isAdmin&&!isAdminUser()){location.replace('admin-dashboard.html?login=required&next=admin-inbox.html');return;}
      if(!isAdmin){
        const productId=params.get('product')||null, productName=params.get('name')||'General enquiry',meta=user.user_metadata||{};
        const payload={customer_id:user.id,product_id:productId,product_name:productId?productName:null,subject:productId?`Enquiry: ${productName}`:'General enquiry',customer_name:meta.full_name||[meta.first_name,meta.surname].filter(Boolean).join(' ')||user.email||'Customer',customer_email:user.email||''};
        const {data:thread,error:upsertError}=await client.from('tdm_conversations').upsert(payload,{onConflict:'customer_id,product_key'}).select().single();if(upsertError)throw upsertError;current=thread.id;
      }
      await refreshThreads(true);
      if(isAdmin){
        const requested=params.get('conversation');
        if(requested){const t=threads.find(x=>x.id===requested);if(t)selectedCustomer=t.customer_id;}
        if(!selectedCustomer&&threads.length)selectedCustomer=threads[0].customer_id;
        renderCustomerProfiles();
        const customerThreads=threads.filter(t=>t.customer_id===selectedCustomer);
        if(customerThreads.length)await selectThread(requested&&customerThreads.some(t=>t.id===requested)?requested:customerThreads[0].id);
        else $('messages').innerHTML='<div class="empty">Select a customer to view their enquiries.</div>';
      }else{
        if(!current&&threads.length)current=threads[0].id;
        if(current)await selectThread(current);else $('messages').innerHTML='<div class="empty">No conversations yet. Open a product and tap Contact Us to start one.</div>';
      }
      $('sendBtn').addEventListener('click',()=>sendMessage());
      $('messageText').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage();}});
      $('attachment').addEventListener('change',e=>{chosenFile=e.target.files?.[0]||null;if(chosenFile)status('Ready to send: '+chosenFile.name);});
      $('recordBtn').addEventListener('click',toggleRecording);
      document.addEventListener('click',e=>{const img=e.target.closest('.chat-image');if(img)openImage(img.src);});
      setInterval(async()=>{if(document.visibilityState==='visible'&&!refreshBusy){refreshBusy=true;try{await refreshThreads(false);if(current)await loadMessages(false);}catch(e){console.warn('Chat refresh:',e);}finally{refreshBusy=false;}}},8000);
    }catch(e){console.error(e);$('messages').innerHTML='<div class="empty">Unable to open chat: '+esc(e.message||'Please try again.')+'</div>';status('Check your sign-in and Supabase chat table permissions.');}
  }
  async function unreadCounts(){
    const {data,error}=await client.from('tdm_messages').select('conversation_id,sender_id').is('read_at',null).neq('sender_id',user.id);
    if(error){console.warn('Unread count unavailable:',error.message);return {};}
    const counts={};for(const m of data||[])counts[m.conversation_id]=(counts[m.conversation_id]||0)+1;return counts;
  }
  function groupedCustomers(counts){
    const map=new Map();for(const t of threads){const key=t.customer_id||t.customer_email||t.id;if(!map.has(key))map.set(key,{key,customer_id:t.customer_id,name:t.customer_name||'Customer',email:t.customer_email||'',items:[],unread:0,last:t.last_message_at||t.created_at||''});const g=map.get(key);g.items.push(t);g.unread+=counts[t.id]||0;if(String(t.last_message_at||'')>String(g.last))g.last=t.last_message_at;}
    return [...map.values()].sort((a,b)=>String(b.last).localeCompare(String(a.last)));
  }
  async function refreshThreads(initial=false){
    const {data,error}=await client.from('tdm_conversations').select('*').order('last_message_at',{ascending:false});if(error)throw error;threads=data||[];
    const counts=await unreadCounts();
    if(isAdmin){renderCustomerProfiles(counts);if(selectedCustomer)renderEnquiries(counts);}
    else{
      const html=threads.map(t=>{const n=counts[t.id]||0;return `<button class="thread ${t.id===current?'active':''}" data-id="${esc(t.id)}"><span class="thread-main"><b>${esc(t.subject||t.product_name||'TDM Support')}</b><small>${esc(t.product_name||'General enquiry')}<br>${esc(formatDate(t.last_message_at))}</small></span>${n?`<span class="unread-badge">${n>99?'99+':n}</span>`:''}</button>`;}).join('');
      const list=$('threadList');if(list&&list.dataset.html!==html){list.innerHTML=html||'<div class="empty">No conversations yet.</div>';list.dataset.html=html;list.querySelectorAll('[data-id]').forEach(b=>b.addEventListener('click',()=>selectThread(b.dataset.id)));}
    }
  }
  function renderCustomerProfiles(counts={}){
    const groups=groupedCustomers(counts),html=groups.map(g=>`<button class="thread customer-profile ${g.key===selectedCustomer?'active':''}" data-customer="${esc(g.key)}"><span class="thread-main"><b>${esc(g.name)}</b><small>${esc(g.email)}<br>${g.items.length} ${g.items.length===1?'enquiry':'enquiries'} · ${esc(formatDate(g.last))}</small></span>${g.unread?`<span class="unread-badge">${g.unread>99?'99+':g.unread}</span>`:''}</button>`).join('');
    const list=$('threadList');if(list&&list.dataset.html!==html){list.innerHTML=html||'<div class="empty">No customers yet.</div>';list.dataset.html=html;list.querySelectorAll('[data-customer]').forEach(b=>b.addEventListener('click',()=>selectCustomer(b.dataset.customer)));}
  }
  function renderEnquiries(counts={}){
    const list=$('enquiryList');if(!list)return;
    const items=threads.filter(t=>(t.customer_id||t.customer_email||t.id)===selectedCustomer);
    const html=items.map(t=>{const n=counts[t.id]||0,title=t.product_name||t.subject||'General enquiry';return `<button class="thread enquiry-card ${t.id===current?'active':''}" data-id="${esc(t.id)}"><span class="thread-main"><b>${esc(title)}</b><small>${esc(t.subject||title)}<br>${esc(formatDate(t.last_message_at))}</small></span>${n?`<span class="unread-badge">${n>99?'99+':n}</span>`:''}</button>`;}).join('');
    if(list.dataset.html!==html){list.innerHTML=html||'<div class="empty">No enquiries for this customer.</div>';list.dataset.html=html;list.querySelectorAll('[data-id]').forEach(b=>b.addEventListener('click',()=>selectThread(b.dataset.id)));}
  }
  async function selectCustomer(key){selectedCustomer=key;const counts=await unreadCounts();renderCustomerProfiles(counts);renderEnquiries(counts);const items=threads.filter(t=>(t.customer_id||t.customer_email||t.id)===key);if(items.length)await selectThread(items[0].id);}
  async function markThreadRead(){if(!current)return;try{const token=await getToken(),url=window.TDM_SUPABASE_URL+`/rest/v1/tdm_messages?conversation_id=eq.${encodeURIComponent(current)}&sender_id=neq.${encodeURIComponent(user.id)}&read_at=is.null`;const r=await fetch(url,{method:'PATCH',headers:{apikey:window.TDM_SUPABASE_PUBLISHABLE_KEY,Authorization:'Bearer '+token,'Content-Type':'application/json','Accept':'application/json','Prefer':'return=minimal'},body:JSON.stringify({read_at:new Date().toISOString()})});if(!r.ok)console.warn('Read receipt update:',await r.text());}catch(e){console.warn(e);}}
  async function selectThread(id){
    if(!id)return;current=id;const t=threads.find(x=>x.id===id);if(isAdmin&&t){selectedCustomer=t.customer_id||t.customer_email||t.id;renderCustomerProfiles();renderEnquiries();}
    $('activeTitle').innerHTML=`<b>${esc(isAdmin?(t?.product_name||t?.subject||'Customer enquiry'):t?.product_name||t?.subject||'TDM Support')}</b><div style="font-size:12px;color:#777;margin-top:4px">${esc(t?.customer_email||t?.subject||'TDM Manufacturing')}</div>`;
    renderedIds=new Set();lastMessageTime=null;$('messages').innerHTML='';await markThreadRead();await loadMessages(true);await refreshThreads(false);
  }
  async function messageMarkup(m){
    let attachment='';if(m.attachment_url){try{const {data,error}=await client.storage.from(BUCKET).createSignedUrl(m.attachment_url,3600);const url=!error?data?.signedUrl:'';if(url){if(m.message_type==='image')attachment=`<img class="chat-image" src="${esc(url)}" alt="Chat attachment" loading="lazy">`;else if(m.message_type==='video')attachment=`<video src="${esc(url)}" controls playsinline preload="metadata"></video>`;else if(m.message_type==='audio')attachment=`<audio src="${esc(url)}" controls preload="metadata"></audio>`;else attachment=`<a href="${esc(url)}" target="_blank" rel="noopener">${esc(m.attachment_name||'Download attachment')}</a>`;}}catch(e){console.warn('Attachment URL:',e);}}
    const mine=m.sender_id===user.id;return `<div class="msg ${mine?'mine':''}" data-message-id="${esc(m.id)}">${m.body?`<div>${esc(m.body).replace(/\n/g,'<br>')}</div>`:''}${attachment}<small>${mine?'You':(m.sender_role==='admin'?adminName:'Customer')} · ${esc(formatDate(m.created_at))}</small></div>`;
  }
  async function loadMessages(reset=false){
    if(!current)return;const {data,error}=await client.from('tdm_messages').select('*').eq('conversation_id',current).order('created_at',{ascending:true});if(error){status(error.message);return;}
    const box=$('messages'),wasNearBottom=box.scrollHeight-box.scrollTop-box.clientHeight<90;let added=0;
    for(const m of data||[]){const id=String(m.id||`${m.created_at}-${m.sender_id}`);if(renderedIds.has(id))continue;const markup=await messageMarkup(m);box.insertAdjacentHTML('beforeend',markup);renderedIds.add(id);lastMessageTime=m.created_at||lastMessageTime;added++;}
    if(!data?.length&&!box.children.length)box.innerHTML='<div class="empty">No messages yet. Send a message to begin.</div>';
    if(reset||wasNearBottom||added)box.scrollTop=box.scrollHeight;
  }
  function openImage(src){const modal=$('imageViewer');if(!modal)return;$('imageViewerImg').src=src;modal.classList.add('open');modal.setAttribute('aria-hidden','false');}
  async function uploadAttachment(file){
    if(!file||!(file instanceof Blob))throw new Error('Please choose a valid attachment.');if(file.size>50*1024*1024)throw new Error('File is larger than 50 MB.');
    const original=String(file.name||'attachment'),ext=(original.includes('.')?original.split('.').pop():'bin').replace(/[^a-z0-9]/gi,'').slice(0,10)||'bin';const unique=crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(16).slice(2)}`,path=`${current}/${Date.now()}-${unique}.${ext}`,mime=String(file.type||'application/octet-stream').trim();
    const {error}=await client.storage.from(BUCKET).upload(path,file,{contentType:mime,upsert:false});if(error)throw error;return {path,type:mime.startsWith('image/')?'image':mime.startsWith('video/')?'video':mime.startsWith('audio/')?'audio':'file'};
  }
  async function sendMessage(fileOverride=null){
    if(!current){status('Please select a conversation first.');return;}const body=String($('messageText').value||'').trim(),file=fileOverride||chosenFile;if(!body&&!file)return;
    $('sendBtn').disabled=true;status('Sending…');try{const uploaded=file?await uploadAttachment(file):null;const payload={conversation_id:current,sender_id:user.id,sender_role:isAdmin?'admin':'customer',message_type:uploaded?.type||'text',body:body||null,attachment_url:uploaded?.path||null,attachment_name:file?.name||null,attachment_mime:file?.type||null,attachment_size:file?.size||null};await restInsertMessage(payload);$('messageText').value='';$('attachment').value='';chosenFile=null;status('Message sent.');await loadMessages(false);await refreshThreads(false);}catch(e){console.error('TDM chat send:',e);status('Could not send: '+(e?.message||String(e)));}finally{$('sendBtn').disabled=false;}
  }
  async function toggleRecording(){
    if(recording){recorder?.stop();return;}if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){status('Voice recording is not supported by this browser.');return;}
    try{const stream=await navigator.mediaDevices.getUserMedia({audio:true}),opts=MediaRecorder.isTypeSupported('audio/webm;codecs=opus')?{mimeType:'audio/webm;codecs=opus'}:{};recorder=new MediaRecorder(stream,opts);recordChunks=[];recording=true;$('recordBtn').textContent='■ Stop recording';status('Recording voice note…');recorder.ondataavailable=e=>{if(e.data?.size)recordChunks.push(e.data);};recorder.onerror=()=>{recording=false;stream.getTracks().forEach(t=>t.stop());status('Voice recording failed.');};recorder.onstop=async()=>{recording=false;stream.getTracks().forEach(t=>t.stop());$('recordBtn').textContent='🎙 Voice note';const mime=recorder.mimeType||recordChunks[0]?.type||'audio/webm',blob=new Blob(recordChunks,{type:mime});if(blob.size)await sendMessage(new File([blob],`voice-note-${Date.now()}.${mime.includes('mp4')?'m4a':'webm'}`,{type:mime}));else status('No audio was recorded.');};recorder.start();}catch(e){recording=false;status('Microphone permission is needed to record a voice note.');}
  }
  document.addEventListener('DOMContentLoaded',()=>{const modal=$('imageViewer');if(modal){modal.addEventListener('click',()=>{modal.classList.remove('open');modal.setAttribute('aria-hidden','true');$('imageViewerImg').src='';});}init();});
})();
