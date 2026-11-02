/* TDM in-app messaging v2: isolated REST inserts, customer/admin inbox and unread badges. */
(() => {
  'use strict';
  const ADMIN_EMAIL='technicaldemoses@gmail.com';
  const BUCKET='tdm-chat-media';
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const params=new URLSearchParams(location.search);
  const isAdmin=location.pathname.toLowerCase().endsWith('admin-inbox.html');
  let client,user,current=null,threads=[],recorder=null,recordChunks=[],recording=false,chosenFile=null,sessionToken=null;
  const adminName='TDM Support';
  function status(t){const el=$('chatStatus');if(el)el.textContent=t;}
  function isAdminUser(){return String(user?.email||'').toLowerCase()===ADMIN_EMAIL;}
  function formatDate(v){try{return v?new Date(v).toLocaleString():''}catch(e){return ''}}
  function showError(e){console.error('TDM chat:',e);status('Could not send: '+(e?.message||String(e)||'Please try again.'));}
  async function getToken(){const {data,error}=await client.auth.getSession();if(error)throw error;sessionToken=data.session?.access_token||sessionToken;if(!sessionToken)throw new Error('Your login session has expired. Please sign in again.');return sessionToken;}
  async function restInsertMessage(payload){
    const token=await getToken();
    const url=window.TDM_SUPABASE_URL+'/rest/v1/tdm_messages';
    const response=await fetch(url,{method:'POST',headers:{'apikey':window.TDM_SUPABASE_PUBLISHABLE_KEY,'Authorization':'Bearer '+token,'Content-Type':'application/json','Accept':'application/json','Prefer':'return=representation'},body:JSON.stringify(payload)});
    const raw=await response.text();let data=null;try{data=raw?JSON.parse(raw):null}catch{}
    if(!response.ok)throw new Error(data?.message||data?.hint||data?.error_description||raw||`Message request failed (${response.status})`);
    return data;
  }
  async function init(){
    try{
      client=tdmGetSupabaseClient();
      const {data,error}=await client.auth.getSession();if(error)throw error;
      user=data.session?.user;sessionToken=data.session?.access_token||null;
      if(!user){sessionStorage.setItem('tdm_return_after_login',(location.pathname.split('/').pop()||'chat.html')+location.search);location.replace('auth.html');return;}
      if(isAdmin&&!isAdminUser()){location.replace('admin-dashboard.html?login=required&next=admin-inbox.html');return;}
      if(!isAdmin){
        const productId=params.get('product')||null, productName=params.get('name')||'General enquiry', meta=user.user_metadata||{};
        const payload={customer_id:user.id,product_id:productId,product_name:productId?productName:null,subject:productId?`Enquiry: ${productName}`:'General enquiry',customer_name:meta.full_name||[meta.first_name,meta.surname].filter(Boolean).join(' ')||user.email||'Customer',customer_email:user.email||''};
        const {data:thread,error:upsertError}=await client.from('tdm_conversations').upsert(payload,{onConflict:'customer_id,product_key'}).select().single();
        if(upsertError)throw upsertError;current=thread.id;
      }
      await refreshThreads();
      if(!current&&isAdmin&&params.get('conversation'))current=threads.find(t=>t.id===params.get('conversation'))?.id||null;
      if(!current&&threads.length)current=threads[0].id;
      if(current)await selectThread(current);else $('messages').innerHTML='<div class="empty">No conversations yet. Open a product and tap Contact Us to start one.</div>';
      $('sendBtn').addEventListener('click',()=>sendMessage());
      $('messageText').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage();}});
      $('attachment').addEventListener('change',e=>{chosenFile=e.target.files?.[0]||null;if(chosenFile)status('Ready to send: '+chosenFile.name);});
      $('recordBtn').addEventListener('click',toggleRecording);
      setInterval(async()=>{if(document.visibilityState==='visible'){try{await refreshThreads();if(current)await loadMessages();}catch(e){console.warn('Chat refresh:',e);}}},7000);
    }catch(e){console.error(e);$('messages').innerHTML='<div class="empty">Unable to open chat: '+esc(e.message||'Please try again.')+'</div>';status('Check your sign-in and Supabase chat table permissions.');}
  }
  async function unreadCounts(){
    const {data,error}=await client.from('tdm_messages').select('conversation_id,sender_role').is('read_at',null).neq('sender_id',user.id);
    if(error){console.warn('Unread count unavailable:',error.message);return {};}
    const counts={};for(const m of data||[]){counts[m.conversation_id]=(counts[m.conversation_id]||0)+1;}return counts;
  }
  async function refreshThreads(){
    const {data,error}=await client.from('tdm_conversations').select('*').order('last_message_at',{ascending:false});if(error)throw error;threads=data||[];
    const counts=await unreadCounts();
    $('threadList').innerHTML=threads.length?threads.map(t=>{
      const n=counts[t.id]||0, title=isAdmin?(t.customer_name||t.customer_email||'Customer'):(t.subject||t.product_name||'TDM Support');
      return `<button class="thread ${t.id===current?'active':''}" data-id="${esc(t.id)}"><span class="thread-main"><b>${esc(title)}</b><small>${esc(t.product_name||t.subject||'General enquiry')}<br>${esc(formatDate(t.last_message_at))}</small></span>${n?`<span class="unread-badge" aria-label="${n} unread messages">${n>99?'99+':n}</span>`:''}</button>`;
    }).join(''):'<div class="empty">No conversations yet.</div>';
    $('threadList').querySelectorAll('[data-id]').forEach(b=>b.addEventListener('click',()=>selectThread(b.dataset.id)));
  }
  async function markThreadRead(){
    if(!current)return;
    try{
      const token=await getToken();
      const url=window.TDM_SUPABASE_URL+`/rest/v1/tdm_messages?conversation_id=eq.${encodeURIComponent(current)}&sender_id=neq.${encodeURIComponent(user.id)}&read_at=is.null`;
      const response=await fetch(url,{method:'PATCH',headers:{'apikey':window.TDM_SUPABASE_PUBLISHABLE_KEY,'Authorization':'Bearer '+token,'Content-Type':'application/json','Accept':'application/json','Prefer':'return=minimal'},body:JSON.stringify({read_at:new Date().toISOString()})});
      if(!response.ok)console.warn('Could not mark messages read:',await response.text());
    }catch(e){console.warn('Read receipt update:',e);}
  }
  async function selectThread(id){
    current=id;const t=threads.find(x=>x.id===id);
    $('activeTitle').innerHTML=`<b>${esc(isAdmin?(t?.customer_name||t?.customer_email||'Customer'):t?.product_name||t?.subject||'TDM Support')}</b><div style="font-size:12px;color:#777;margin-top:4px">${esc(t?.customer_email||t?.subject||'TDM Manufacturing')}</div>`;
    await markThreadRead();await refreshThreads();await loadMessages();
  }
  async function loadMessages(){
    if(!current)return;
    const {data,error}=await client.from('tdm_messages').select('*').eq('conversation_id',current).order('created_at',{ascending:true});if(error){status(error.message);return;}
    const html=await Promise.all((data||[]).map(async m=>{
      let attachment='';if(m.attachment_url){let url='';try{const {data:signed,error:signedError}=await client.storage.from(BUCKET).createSignedUrl(m.attachment_url,3600);if(!signedError)url=signed?.signedUrl||'';}catch(e){console.warn('Attachment URL:',e);}
        if(url){if(m.message_type==='image')attachment=`<a href="${esc(url)}" target="_blank" rel="noopener"><img src="${esc(url)}" alt="Chat attachment"></a>`;else if(m.message_type==='video')attachment=`<video src="${esc(url)}" controls playsinline></video>`;else if(m.message_type==='audio')attachment=`<audio src="${esc(url)}" controls></audio>`;else attachment=`<a href="${esc(url)}" target="_blank" rel="noopener">${esc(m.attachment_name||'Download attachment')}</a>`;}}
      const mine=m.sender_id===user.id;return `<div class="msg ${mine?'mine':''}">${m.body?`<div>${esc(m.body).replace(/\n/g,'<br>')}</div>`:''}${attachment}<small>${mine?'You':(m.sender_role==='admin'?adminName:'Customer')} · ${esc(formatDate(m.created_at))}</small></div>`;
    }));
    $('messages').innerHTML=html.join('')||'<div class="empty">No messages yet. Send a message to begin.</div>';$('messages').scrollTop=$('messages').scrollHeight;
  }
  async function uploadAttachment(file){
    if(!file||!(file instanceof Blob))throw new Error('Please choose a valid attachment.');if(file.size>50*1024*1024)throw new Error('File is larger than 50 MB.');
    const originalName=String(file.name||'attachment'),ext=(originalName.includes('.')?originalName.split('.').pop():'bin').replace(/[^a-z0-9]/gi,'').slice(0,10)||'bin';
    const unique=(window.crypto&&typeof crypto.randomUUID==='function')?crypto.randomUUID():`${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const path=`${current}/${Date.now()}-${unique}.${ext}`;
    const mime=String(file.type||'application/octet-stream').trim();
    const {error}=await client.storage.from(BUCKET).upload(path,file,{contentType:mime,upsert:false});if(error)throw error;
    const type=mime.startsWith('image/')?'image':mime.startsWith('video/')?'video':mime.startsWith('audio/')?'audio':'file';return {path,type};
  }
  async function sendMessage(fileOverride=null){
    if(!current){status('Please select a conversation first.');return;}
    const body=String($('messageText').value||'').trim(),file=fileOverride||chosenFile;if(!body&&!file)return;
    $('sendBtn').disabled=true;status('Sending…');let uploaded=null;
    try{
      if(file)uploaded=await uploadAttachment(file);
      const payload={conversation_id:current,sender_id:user.id,sender_role:isAdmin?'admin':'customer',message_type:uploaded?.type||'text',body:body||null,attachment_url:uploaded?.path||null,attachment_name:file?.name||null,attachment_mime:file?.type||null,attachment_size:file?.size||null};
      await restInsertMessage(payload);
      $('messageText').value='';$('attachment').value='';chosenFile=null;status('Message sent.');
      try{await loadMessages();await refreshThreads();}catch(e){console.warn('Post-send refresh:',e);status('Message sent. Pull down or reopen the chat to refresh.');}
    }catch(e){showError(e);}finally{$('sendBtn').disabled=false;}
  }
  async function toggleRecording(){
    if(recording){recorder?.stop();return;}if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){status('Voice recording is not supported by this browser.');return;}
    try{const stream=await navigator.mediaDevices.getUserMedia({audio:true});const options=MediaRecorder.isTypeSupported('audio/webm;codecs=opus')?{mimeType:'audio/webm;codecs=opus'}:{};recorder=new MediaRecorder(stream,options);recordChunks=[];recording=true;$('recordBtn').textContent='■ Stop recording';status('Recording voice note…');
      recorder.ondataavailable=e=>{if(e.data?.size)recordChunks.push(e.data);};recorder.onerror=e=>{recording=false;stream.getTracks().forEach(t=>t.stop());status('Voice recording failed. Please try again.');};
      recorder.onstop=async()=>{recording=false;stream.getTracks().forEach(t=>t.stop());$('recordBtn').textContent='🎙 Voice note';const mime=recorder.mimeType||recordChunks[0]?.type||'audio/webm';const blob=new Blob(recordChunks,{type:mime});if(blob.size){const ext=mime.includes('mp4')?'m4a':'webm';await sendMessage(new File([blob],`voice-note-${Date.now()}.${ext}`,{type:mime}));}else status('No audio was recorded. Please try again.');};recorder.start();
    }catch(e){recording=false;status('Microphone permission is needed to record a voice note.');}
  }
  document.addEventListener('DOMContentLoaded',init);
})();
