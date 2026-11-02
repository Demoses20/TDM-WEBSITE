/* TDM in-app messaging. Uses the existing Supabase project and auth session. */
(() => {
  const ADMIN_EMAIL='technicaldemoses@gmail.com';
  const BUCKET='tdm-chat-media';
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const params=new URLSearchParams(location.search);
  const safePage=(fallback)=>{const p=(location.pathname||'').split('/').filter(Boolean).pop();return p||fallback;};
  const isAdmin=location.pathname.toLowerCase().endsWith('admin-inbox.html');
  let client,user,current=null,threads=[],recorder=null,recordChunks=[],recording=false,chosenFile=null;
  const adminName='TDM Support';

  function status(t){$('chatStatus').textContent=t;}
  function isAdminUser(){return String(user?.email||'').toLowerCase()===ADMIN_EMAIL;}
  function formatDate(v){try{return new Date(v).toLocaleString()}catch(e){return ''}}

  async function init(){
    try{
      client=tdmGetSupabaseClient();
      const {data,error}=await client.auth.getSession(); if(error)throw error;
      user=data.session?.user;
      if(!user){
        sessionStorage.setItem('tdm_return_after_login',safePage('chat.html')+location.search);
        location.replace('auth.html');return;
      }
      if(isAdmin && !isAdminUser()){location.replace('admin-dashboard.html?login=required&next=admin-inbox.html');return;}
      if(!isAdmin){
        const productId=params.get('product')||null;
        const productName=params.get('name')||'General enquiry';
        const meta=user.user_metadata||{};
        const payload={customer_id:user.id,product_id:productId,product_name:productId?productName:null,
          subject:productId?`Enquiry: ${productName}`:'General enquiry',
          customer_name:meta.full_name||[meta.first_name,meta.surname].filter(Boolean).join(' ')||user.email||'Customer',
          customer_email:user.email||''};
        const {data:thread,error:upsertError}=await client.from('tdm_conversations')
          .upsert(payload,{onConflict:'customer_id,product_key'}).select().single();
        if(upsertError)throw upsertError;
        current=thread.id;
      }
      await refreshThreads();
      if(!current && isAdmin && params.get('customer')){
        current=threads.find(t=>t.customer_id===params.get('customer'))?.id||null;
      }
      if(!current && threads.length) current=threads[0].id;
      if(current)await selectThread(current);
      else {$('messages').innerHTML='<div class="empty">No conversations yet. Open a product and tap Contact Us to start one.</div>';}
      $('sendBtn').addEventListener('click',sendMessage);
      $('messageText').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage();}});
      $('attachment').addEventListener('change',e=>{chosenFile=e.target.files?.[0]||null; if(chosenFile)status('Ready to send: '+chosenFile.name);});
      $('recordBtn').addEventListener('click',toggleRecording);
      setInterval(async()=>{if(document.visibilityState==='visible'){await refreshThreads();if(current)await loadMessages();}},5000);
    }catch(e){console.error(e);$('messages').innerHTML='<div class="empty">Unable to open chat: '+esc(e.message||'Please try again.')+'</div>';status('If this is a new feature, first run SUPABASE-TDM-IN-APP-CHAT.sql in Supabase.');}
  }

  async function refreshThreads(){
    const q=client.from('tdm_conversations').select('*').order('last_message_at',{ascending:false});
    const {data,error}=await q;if(error)throw error;
    threads=data||[];
    $('threadList').innerHTML=threads.length?threads.map(t=>`
      <button class="thread ${t.id===current?'active':''}" data-id="${esc(t.id)}">
       <b>${esc(isAdmin?(t.customer_name||t.customer_email||'Customer'):t.subject||t.product_name||'TDM Support')}</b>
       <small>${esc(t.product_name||t.subject||'General enquiry')}<br>${esc(formatDate(t.last_message_at))}</small>
      </button>`).join(''):'<div class="empty">No conversations yet.</div>';
    $('threadList').querySelectorAll('[data-id]').forEach(b=>b.addEventListener('click',()=>selectThread(b.dataset.id)));
  }

  async function selectThread(id){
    current=id;const t=threads.find(x=>x.id===id);
    $('activeTitle').innerHTML=`<b>${esc(isAdmin?(t?.customer_name||t?.customer_email||'Customer'):t?.product_name||t?.subject||'TDM Support')}</b><div style="font-size:12px;color:#777;margin-top:4px">${esc(t?.customer_email||t?.subject||'TDM Manufacturing')}</div>`;
    await refreshThreads();await loadMessages();
  }

  async function loadMessages(){
    if(!current)return;
    const {data,error}=await client.from('tdm_messages').select('*').eq('conversation_id',current).order('created_at',{ascending:true});
    if(error){status(error.message);return;}
    const rows=data||[];
    const html=await Promise.all(rows.map(async m=>{
      let attachment='';
      if(m.attachment_url){
        let url='';
        try{const {data:signed,error:signedError}=await client.storage.from(BUCKET).createSignedUrl(m.attachment_url,3600);if(!signedError)url=signed?.signedUrl||'';}catch(urlError){console.warn('Attachment preview unavailable:',urlError);}
        if(url){
          if(m.message_type==='image')attachment=`<a href="${esc(url)}" target="_blank"><img src="${esc(url)}" alt="Customer attachment"></a>`;
          else if(m.message_type==='video')attachment=`<video src="${esc(url)}" controls playsinline></video>`;
          else if(m.message_type==='audio')attachment=`<audio src="${esc(url)}" controls></audio>`;
          else attachment=`<a href="${esc(url)}" target="_blank" rel="noopener">${esc(m.attachment_name||'Download attachment')}</a>`;
        }
      }
      const mine=m.sender_id===user.id;
      return `<div class="msg ${mine?'mine':''}">${m.body?`<div>${esc(m.body).replace(/\n/g,'<br>')}</div>`:''}${attachment}<small>${mine?'You':(m.sender_role==='admin'?adminName:'Customer')} · ${esc(formatDate(m.created_at))}</small></div>`;
    }));
    $('messages').innerHTML=html.join('')||'<div class="empty">No messages yet. Send a message to begin.</div>';
    $('messages').scrollTop=$('messages').scrollHeight;
  }

  async function uploadAttachment(file){
    if(file.size>50*1024*1024)throw new Error('File is larger than 50 MB.');
    const originalName=String(file?.name||'attachment');
    const ext=(originalName.includes('.')?originalName.split('.').pop():'bin').replace(/[^a-z0-9]/gi,'').slice(0,10)||'bin';
    const unique=(window.crypto&&typeof crypto.randomUUID==='function')?crypto.randomUUID():`${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const path=`${current}/${Date.now()}-${unique}.${ext}`;
    const {error}=await client.storage.from(BUCKET).upload(path,file,{contentType:file.type||'application/octet-stream',upsert:false});
    if(error)throw error;
    const mime=String(file.type||'').toLowerCase();
    const type=mime.startsWith('image/')?'image':mime.startsWith('video/')?'video':mime.startsWith('audio/')?'audio':'file';
    return {path,type};
  }

  async function sendMessage(fileOverride=null){
    if(!current){status('Please select a conversation first.');return;}
    const body=String($('messageText').value||'').trim();
    const file=fileOverride||chosenFile;
    if(!body&&!file)return;
    $('sendBtn').disabled=true;status('Sending…');
    let uploaded=null;
    try{
      if(file)uploaded=await uploadAttachment(file);
      const payload={conversation_id:current,sender_id:user.id,sender_role:isAdmin?'admin':'customer',
        message_type:uploaded?.type||'text',body:body||null,attachment_url:uploaded?.path||null,
        attachment_name:file?.name||'Attachment',attachment_mime:file?.type||null,attachment_size:file?.size||null};
      const {error}=await client.from('tdm_messages').insert(payload);
      if(error)throw error;
      // Clear the composer as soon as the database confirms the insert. A later
      // refresh/render failure must not make a successfully sent message look unsent.
      $('messageText').value='';$('attachment').value='';chosenFile=null;
      status('Message sent.');
      try{await loadMessages();}catch(refreshError){console.error('Message refresh failed:',refreshError);status('Message sent. Refresh the page if it is not visible yet.');}
      try{await refreshThreads();}catch(threadError){console.error('Thread refresh failed:',threadError);}
    }catch(e){
      console.error('TDM message send failed:',e);
      status('Could not send: '+(e?.message||'Please try again.'));
    }finally{$('sendBtn').disabled=false;}
  }

  async function toggleRecording(){
    if(recording){recorder?.stop();return;}
    if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){status('Voice recording is not supported by this browser.');return;}
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});
      recorder=new MediaRecorder(stream);recordChunks=[];recording=true;
      $('recordBtn').textContent='■ Stop recording';status('Recording voice note…');
      recorder.ondataavailable=e=>{if(e.data.size)recordChunks.push(e.data);};
      recorder.onstop=async()=>{
        recording=false;stream.getTracks().forEach(t=>t.stop());$('recordBtn').textContent='🎙 Voice note';
        const blob=new Blob(recordChunks,{type:recorder.mimeType||'audio/webm'});
        if(blob.size){const ext=blob.type.includes('mp4')?'m4a':'webm';await sendMessage(new File([blob],`voice-note-${Date.now()}.${ext}`,{type:blob.type}));}
      };
      recorder.start();
    }catch(e){recording=false;status('Microphone permission is needed to record a voice note.');}
  }
  document.addEventListener('DOMContentLoaded',init);
})();
