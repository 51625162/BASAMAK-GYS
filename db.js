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

  /*
     ÖNEMLİ VERİ KORUMA DÜZELTMESİ
     İçerik eklerken kayıtlar kesinlikle birbirinin üzerine yazılmamalı.
     Eski veri katmanı Firestore'u yalnızca source:'server' ile okuyordu.
     Geçici bir ağ/cache sorunu olduğunda liste eksik görünebiliyordu.
     Burada okuma katmanını güçlendiriyoruz: önce sunucuyu, hata olursa
     normal Firestore kaynağını okuyor; ayrıca son eklenen kayıtları da
     birleştiriyor. Kayıt ekleme işlemi yine .add() olduğu için her yeni
     içerik ayrı kayıt olarak korunuyor.
  */
  if(typeof bgysUserCollection==='function'){
    const bgysOriginalRecentRead=window.bgysRecentRead;
    const bgysOriginalGetAll=window.bgysGetAll;
    const bgysOriginalGetAllByModul=window.bgysGetAllByModul;

    window.bgysGetAll=async function(storeName){
      await bgysInitFirebase();
      const user=bgysCurrentUser()||await bgysWaitForAuth();
      if(!user)return[];

      let docs=[];
      try{
        let snap;
        try{
          snap=await bgysUserCollection(storeName).get({source:'server'});
        }catch(e){
          snap=await bgysUserCollection(storeName).get();
        }
        docs=snap.docs.map(d=>({id:d.id,...d.data()})).filter(r=>!r.deleted);
      }catch(e){
        console.warn('BGYS veri okuma uyarısı:',storeName,e);
      }

      const map=new Map(docs.map(r=>[String(r.id),r]));
      try{
        const recent=typeof bgysOriginalRecentRead==='function'
          ? bgysOriginalRecentRead(storeName)
          : [];
        for(const r of recent){
          if(r && r.id && !r.deleted && !map.has(String(r.id))) map.set(String(r.id),r);
        }
      }catch(e){}

      return Array.from(map.values()).sort((a,b)=>(Number(a.createdAt)||0)-(Number(b.createdAt)||0));
    };

    window.bgysGetAllByModul=async function(storeName){
      const modul=bgysCurrentModul();
      const rows=await window.bgysGetAll(storeName);
      return rows.filter(r=>{
        const modules=typeof bgysModulesOf==='function'
          ? bgysModulesOf(r)
          : (Array.isArray(r.moduller)?r.moduller:(r.modul?[r.modul]:[]));
        return modules.includes(modul);
      });
    };

    /* Referanslar başka kodlar tarafından tutulmuş olsa bile yeni fonksiyonları kullan. */
    window.bgysRefreshAllContentSafely=async function(){
      const stores=['konular','sorular','soruSetleri','soruCevap','denemeler'];
      const out={};
      for(const s of stores)out[s]=await window.bgysGetAll(s);
      return out;
    };
  }

  const shareBatchScript=document.createElement('script');
  shareBatchScript.src='share-batch.js?v=20260811-2';
  document.head.appendChild(shareBatchScript);
  const deleteFixScript=document.createElement('script');
  deleteFixScript.src='delete-fix.js?v=20260812-2';
  document.head.appendChild(deleteFixScript);

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
      #bgysBolumSecimWrap{margin:-5px 0 16px;padding:12px 14px;border:1px solid var(--mist);border-radius:14px;background:var(--cloud);}
      #bgysBolumSecimWrap label{display:block;font-size:.8rem;font-weight:800;color:var(--ink);margin-bottom:6px;}
      #bgysBolumSecim{width:100%;padding:10px 12px;border-radius:11px;border:1.5px solid var(--mist);background:#fff;color:var(--ink);font-size:.88rem;}
      #bgysBolumSecimHint{margin:6px 0 0;color:var(--slate);font-size:.72rem;line-height:1.4;}
      #bgysSoruBolumSecimWrap{margin:-5px 0 16px;padding:12px 14px;border:1px solid var(--mist);border-radius:14px;background:var(--cloud);}
      #bgysSoruBolumSecimWrap label{display:block;font-size:.8rem;font-weight:800;color:var(--ink);margin-bottom:6px;}
      #bgysSoruBolumSecim{width:100%;padding:10px 12px;border-radius:11px;border:1.5px solid var(--mist);background:#fff;color:var(--ink);font-size:.88rem;}
      #bgysSoruBolumSecimHint{margin:6px 0 0;color:var(--slate);font-size:.72rem;line-height:1.4;}
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

  const BOLUM_STORAGE='bgys_kayitli_bolumler_v1';
  let bolumCloudWriteTimer=null;
  function readLocalBolumler(){try{const a=JSON.parse(localStorage.getItem(BOLUM_STORAGE)||'[]');return Array.isArray(a)?a.filter(Boolean):[]}catch(e){return[]}}
  function writeLocalBolumler(arr){try{localStorage.setItem(BOLUM_STORAGE,JSON.stringify(arr))}catch(e){}}
  function mergeBolumler(arr){const out=[];const seen=new Set();[...readLocalBolumler(),...(arr||[])].forEach(v=>{const x=String(v||'').trim();const k=x.toLocaleLowerCase('tr-TR');if(x&&!seen.has(k)){seen.add(k);out.push(x)}});out.sort((a,b)=>a.localeCompare(b,'tr'));writeLocalBolumler(out);return out}
  async function cloudBolumler(){try{await bgysInitFirebase();const u=bgysCurrentUser()||await bgysWaitForAuth();if(!u)return[];const snap=await bgysUserCollection('kayitliBolumler').get({source:'server'});return snap.docs.map(d=>d.data().ad).filter(Boolean)}catch(e){return[]}}
  async function saveBolumCloud(ad){const x=String(ad||'').trim();if(!x)return;try{await bgysInitFirebase();const u=bgysCurrentUser()||await bgysWaitForAuth();if(!u)return;const id=encodeURIComponent(x.toLocaleLowerCase('tr-TR')).replace(/%/g,'_');await bgysUserCollection('kayitliBolumler').doc(id).set({ad:x,updatedAt:Date.now()},{merge:true})}catch(e){console.warn('Bölüm kaydı buluta yazılamadı',e)}}
  function populateBolumSelects(list){const selects=['bgysBolumSecim','bgysSoruBolumSecim'].map(id=>document.getElementById(id)).filter(Boolean);selects.forEach(sel=>{const current=sel.value;sel.innerHTML='<option value="">— Kayıtlı Bölüm / Kısım seç —</option>'+list.map(x=>'<option value="'+String(x).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;')+'">'+String(x).replace(/&/g,'&amp;').replace(/</g,'&lt;')+'</option>').join('');if(list.includes(current))sel.value=current})}
  async function refreshPersistentBolumler(){const konular=typeof bgysGetAllByModul==='function'?await bgysGetAllByModul('konular'):[];const sorular=typeof bgysGetAllByModul==='function'?await bgysGetAllByModul('sorular'):[];const fromContent=[...konular,...sorular].map(x=>x.bolum).filter(Boolean);let list=mergeBolumler(fromContent);const cloud=await cloudBolumler();list=mergeBolumler(cloud);populateBolumSelects(list);const dl=document.getElementById('bolumListesi');if(dl)dl.innerHTML=list.map(b=>'<option value="'+String(b).replace(/&/g,'&amp;').replace(/"/g,'&quot;')+'">').join('')}
  function addBolumSelector(inputId,wrapId,selectId,hintId){const input=document.getElementById(inputId);if(!input||document.getElementById(wrapId))return;const wrap=document.createElement('div');wrap.id=wrapId;wrap.innerHTML='<label for="'+selectId+'">📚 Kayıtlı Bölüm / Kısım</label><select id="'+selectId+'"><option value="">— Kayıtlı Bölüm / Kısım seç —</option></select><p id="'+hintId+'">Daha önce eklediğin bölüm burada kalır. Seçtiğinde yukarıdaki alana aktarılır.</p>';input.parentNode.insertBefore(wrap,input);const sel=wrap.querySelector('select');sel.addEventListener('change',()=>{if(sel.value)input.value=sel.value})}
  function hookBolumSaveButton(buttonId,inputId){const btn=document.getElementById(buttonId),input=document.getElementById(inputId);if(!btn||!input||btn.dataset.bgysBolumHooked)return;btn.dataset.bgysBolumHooked='1';btn.addEventListener('click',()=>{const value=input.value.trim();if(!value)return;mergeBolumler([value]);clearTimeout(bolumCloudWriteTimer);bolumCloudWriteTimer=setTimeout(()=>saveBolumCloud(value),250);setTimeout(refreshPersistentBolumler,350)},true)}
  function installBolumFeatures(){if(!document.getElementById('konuBolum')&&!document.getElementById('soruBolum'))return;addStyle();addBolumSelector('konuBolum','bgysBolumSecimWrap','bgysBolumSecim','bgysBolumSecimHint');addBolumSelector('soruBolum','bgysSoruBolumSecimWrap','bgysSoruBolumSecim','bgysSoruBolumSecimHint');hookBolumSaveButton('konuKaydetBtn','konuBolum');hookBolumSaveButton('soruMetinEkleBtn','soruBolum');hookBolumSaveButton('soruGorselEkleBtn','soruBolum');hookBolumSaveButton('soruPdfEkleBtn','soruBolum');refreshPersistentBolumler()}

  function start(){addStyle();installSavedUsers();setTimeout(addStyle,100);setTimeout(installSavedUsers,100);setTimeout(addStyle,500);setTimeout(installSavedUsers,500);setTimeout(installBolumFeatures,100);setTimeout(installBolumFeatures,500);setTimeout(installBolumFeatures,1200)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
