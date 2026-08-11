/* Basamak GYS - Firebase veri katmanı yükleyici + görünüm düzeltmeleri */
(function(){
  const STABLE_DB_URL='https://raw.githubusercontent.com/51625162/BASAMAK-GYS/8c287acabae45160ad0e4edc56c0ebe01164202f/db.js';
  const xhr=new XMLHttpRequest();
  xhr.open('GET',STABLE_DB_URL,false);
  xhr.send(null);
  if(xhr.status<200||xhr.status>=300||!xhr.responseText)throw new Error('Basamak GYS veri katmanı yüklenemedi.');
  const script=document.createElement('script');
  script.textContent=xhr.responseText;
  document.head.appendChild(script);
  const shareBatchScript=document.createElement('script');
  shareBatchScript.src='share-batch.js?v=20260811-2';
  document.head.appendChild(shareBatchScript);

  function addStyle(){
    if(document.getElementById('bgysDbFixStyle'))return;
    const st=document.createElement('style');
    st.id='bgysDbFixStyle';
    st.textContent=`
      #konuList,#soruList,#soruSetiList,#soruCevapList,#denemeList{display:block!important;height:190px!important;max-height:190px!important;min-height:0!important;overflow-y:auto!important;overflow-x:hidden!important;padding:2px 8px 4px 0!important;margin:0!important;-webkit-overflow-scrolling:touch;}
      #konuList .item-card,#soruList .item-card,#soruSetiList .item-card,#soruCevapList .item-card,#denemeList .item-card{margin-bottom:8px!important;flex-shrink:0!important;}
      #bgysGroupShareCard,#bgysSavedShareCard,#bgysQuickShareCard{display:none!important;}
      #bgysPersistentSavedUsers{border:1px solid var(--mist);background:var(--cloud);border-radius:16px;padding:16px;margin:16px 0;}
      #bgysPersistentSavedUsers h4{margin:0 0 5px;font-size:.98rem;}
      #bgysPersistentSavedUsers .help{margin:0 0 12px;color:var(--slate);font-size:.78rem;line-height:1.45;}
      #bgysPersistentSavedUsersList{display:flex;flex-direction:column;gap:7px;margin-bottom:12px;}
      .bgys-persist-user{display:flex;align-items:center;gap:7px;background:var(--white);border:1px solid var(--mist);border-radius:12px;padding:8px 9px;}
      .bgys-persist-user .pick{flex:1;text-align:left;background:transparent;color:var(--ink);font-size:.8rem;font-weight:700;padding:5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
      .bgys-persist-user .remove{background:rgba(239,68,68,.1);color:#C0392B;border-radius:9px;padding:6px 8px;font-weight:800;}
      #bgysPersistentSavedUsersAdd{display:flex;gap:7px;}
      #bgysPersistentSavedUsersEmail{flex:1;min-width:0;padding:10px 12px;border-radius:11px;border:1.5px solid var(--mist);background:var(--white);font-size:.84rem;}
      #bgysPersistentSavedUsersAddBtn{background:var(--ink);color:#fff;border-radius:11px;padding:10px 13px;font-weight:700;font-size:.8rem;}
    `;
    document.head.appendChild(st);
  }

  async function getSavedUsers(){
    await bgysInitFirebase();
    const u=bgysCurrentUser()||await bgysWaitForAuth();
    if(!u)return[];
    const snap=await bgysUserCollection('paylasimKullanicilari').get({source:'server'});
    return snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(a.email||'').localeCompare(b.email||'','tr'));
  }
  async function saveSavedUser(email){
    const e=String(email||'').trim().toLowerCase();
    if(!e||!e.includes('@'))throw new Error('Geçerli bir e-posta yaz.');
    await bgysInitFirebase();
    const u=bgysCurrentUser()||await bgysWaitForAuth();
    if(!u)throw new Error('Giriş yapılmamış.');
    const id=encodeURIComponent(e).replace(/%/g,'_');
    await bgysUserCollection('paylasimKullanicilari').doc(id).set({email:e,createdAt:Date.now()},{merge:true});
  }
  async function deleteSavedUser(id){
    await bgysInitFirebase();
    const u=bgysCurrentUser()||await bgysWaitForAuth();
    if(!u)throw new Error('Giriş yapılmamış.');
    await bgysUserCollection('paylasimKullanicilari').doc(String(id)).delete();
  }

  function installSavedUsers(){
    const body=document.querySelector('#syncOverlay .sync-body');
    const bulk=document.getElementById('bulkShareResult');
    if(!body||!bulk||document.getElementById('bgysPersistentSavedUsers'))return;
    const card=document.createElement('div');
    card.id='bgysPersistentSavedUsers';
    card.innerHTML='<h4>👥 Kayıtlı Kullanıcılar</h4><p class="help">Buraya eklediğin kullanıcılar sen silene kadar hesabında kayıtlı kalır. Kullanıcıya tıklayınca paylaşım e-posta alanına aktarılır.</p><div id="bgysPersistentSavedUsersList">Yükleniyor...</div><div id="bgysPersistentSavedUsersAdd"><input id="bgysPersistentSavedUsersEmail" type="email" placeholder="kullanici@mail.com"><button id="bgysPersistentSavedUsersAddBtn">+ Kullanıcı Ekle</button></div>';
    bulk.parentNode.insertBefore(card,bulk.nextSibling);
    const list=document.getElementById('bgysPersistentSavedUsersList');
    async function load(){
      try{
        const arr=await getSavedUsers();
        if(!arr.length){list.innerHTML='<div style="color:var(--slate);font-size:.78rem">Henüz kayıtlı kullanıcı yok.</div>';return;}
        list.innerHTML=arr.map(x=>'<div class="bgys-persist-user"><button class="pick" type="button" data-email="'+x.email+'">👤 '+x.email+'</button><button class="remove" type="button" data-id="'+x.id+'" title="Sil">🗑️</button></div>').join('');
        list.querySelectorAll('.pick').forEach(b=>b.onclick=()=>{const input=document.getElementById('bulkShareEmail');if(input)input.value=b.dataset.email;const batch=document.getElementById('bgysBatchShareEmail');if(batch)batch.value=b.dataset.email;});
        list.querySelectorAll('.remove').forEach(b=>b.onclick=async()=>{if(!confirm('Bu kayıtlı kullanıcı silinsin mi?'))return;try{await deleteSavedUser(b.dataset.id);await load();}catch(e){alert('Silme hatası: '+e.message);}});
      }catch(e){list.textContent='Kullanıcılar yüklenemedi: '+e.message;}
    }
    document.getElementById('bgysPersistentSavedUsersAddBtn').onclick=async()=>{
      const input=document.getElementById('bgysPersistentSavedUsersEmail');
      try{await saveSavedUser(input.value);input.value='';await load();}
      catch(e){alert(e.message);}
    };
    load();
  }

  function start(){
    addStyle();
    installSavedUsers();
    setTimeout(addStyle,100);
    setTimeout(installSavedUsers,100);
    setTimeout(addStyle,500);
    setTimeout(installSavedUsers,500);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();