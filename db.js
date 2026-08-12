/* Basamak GYS - Firebase veri katmanı yükleyici + görünüm düzeltmeleri */
(function(){
  const STABLE_DB_URL='https://raw.githubusercontent.com/51625162/BASAMAK-GYS/8c287acabae45160ad0e4edc56c0ebe01164202f/db.js';
  const xhr=new XMLHttpRequest(); xhr.open('GET',STABLE_DB_URL,false); xhr.send(null);
  if(xhr.status<200||xhr.status>=300||!xhr.responseText)throw new Error('Basamak GYS veri katmanı yüklenemedi.');
  const script=document.createElement('script'); script.textContent=xhr.responseText; document.head.appendChild(script);

  /* ================================================================
     VERİ KORUMA KİLİDİ
     Yeni evrak/belge/görsel eklenmesi mevcut kaydın üzerine yazamaz.
     Her yeni kayıt daima Firestore add() ile ayrı belge olarak oluşturulur.
     Dosya yükleme yolu da her seferinde benzersizdir; aynı isimli yeni
     bir dosya eski Storage dosyasını asla ezmez.
  ================================================================ */
  const _originalAdd=window.bgysAdd;
  const _originalUploadFile=window.bgysUploadFile;
  const _originalUploadSmart=window.bgysUploadSmart;

  window.bgysAdd=async function(store,record){
    const copy={...(record||{})};
    /* Yeni içerikte mevcut bir id verilse bile onu güncelleme anahtarı olarak
       kullanma. Bu fonksiyonun görevi YENİ kayıt eklemektir. */
    delete copy.id;
    delete copy._recentAt;
    copy.createdAt=Number(copy.createdAt)||Date.now();
    copy.contentRevisionId=(crypto&&crypto.randomUUID)?crypto.randomUUID():String(Date.now())+'-'+Math.random().toString(36).slice(2);
    return _originalAdd(store,copy);
  };

  window.bgysUploadFile=async function(file,folder){
    await bgysInitFirebase();
    const u=bgysCurrentUser()||await bgysWaitForAuth();
    if(!u)throw new Error('Giriş yapılmamış');
    const clean=(file.name||'dosya').replace(/[^a-zA-Z0-9.\-_]/g,'_');
    const unique=(crypto&&crypto.randomUUID)?crypto.randomUUID():String(Date.now())+'_'+Math.random().toString(36).slice(2);
    const path=`users/${u.uid}/${folder}/${Date.now()}_${unique}_${clean}`;
    const ref=firebase.storage().ref().child(path);
    const snap=await ref.put(file);
    return snap.ref.getDownloadURL();
  };

  window.bgysUploadSmart=async function(file,folder){
    /* Küçük dosyalarda mevcut hızlı inline davranışı; büyüklerde benzersiz
       Storage yolu. Her iki durumda da eski dosyaya dokunulmaz. */
    if(file && file.size*1.37>880000)return window.bgysUploadFile(file,folder);
    const dataUrl=await bgysFileToDataUrl(file);
    return dataUrl.length<=880000?dataUrl:window.bgysUploadFile(file,folder);
  };

  /* Eski içerikleri yalnızca listelemek için oku. Eksik/önbellek verisi
     geldiğinde mevcut kayıtları yanlışlıkla silme veya değiştirme yok. */
  window.bgysGetAll=async function(storeName){
    await bgysInitFirebase();
    const user=bgysCurrentUser()||await bgysWaitForAuth();
    if(!user)return[];
    let docs=[];
    try{
      let snap;
      try{snap=await bgysUserCollection(storeName).get({source:'server'});}catch(e){snap=await bgysUserCollection(storeName).get();}
      docs=snap.docs.map(d=>({id:d.id,...d.data()})).filter(r=>!r.deleted);
    }catch(e){console.warn('BGYS okuma:',storeName,e);}
    const map=new Map(docs.map(r=>[String(r.id),r]));
    try{
      const recent=typeof bgysRecentRead==='function'?bgysRecentRead(storeName):[];
      for(const r of recent){if(r&&r.id&&!r.deleted&&!map.has(String(r.id)))map.set(String(r.id),r);}
    }catch(e){}
    return Array.from(map.values()).sort((a,b)=>(Number(a.createdAt)||0)-(Number(b.createdAt)||0));
  };
  window.bgysGetAllByModul=async function(storeName){
    const modul=bgysCurrentModul();
    return (await window.bgysGetAll(storeName)).filter(r=>bgysModulesOf(r).includes(modul));
  };

  /* İçe aktarma mevcut dosyaları ezmesin: aynı id ile gelen kayıt da yeni
     bir belge olarak alınır. Orijinal yedek dosyası değişmez. */
  window.bgysPutAll=async function(storeName,records){
    await bgysInitFirebase();
    const user=bgysCurrentUser()||await bgysWaitForAuth();
    if(!user)throw new Error('Giriş yapılmamış');
    for(const source of (records||[])){
      const copy={...(source||{})};
      delete copy.id; delete copy._recentAt;
      copy.createdAt=Number(copy.createdAt)||Date.now();
      copy.contentRevisionId=(crypto&&crypto.randomUUID)?crypto.randomUUID():String(Date.now())+'-'+Math.random().toString(36).slice(2);
      await _originalAdd(storeName,copy);
    }
  };

  /* Paylaşım/gönderim için kullanılan mevcut kayda ait güncelleme fonksiyonları
     sadece ilgili alanları değiştirir; evrakın kendisi korunur. */
  window.bgysSafeUpdateMeta=async function(store,id,fields){
    await bgysInitFirebase();
    const ref=bgysUserCollection(store).doc(String(id));
    const snap=await ref.get({source:'server'});
    if(!snap.exists)throw new Error('Kayıt bulunamadı');
    const safe={...fields};
    delete safe.id; delete safe.dataUrl; delete safe.fileUrl; delete safe.downloadURL; delete safe.fileName; delete safe.metin;
    await ref.update(safe);
  };

  /* Önceki yardımcı düzeltmeler */
  const shareBatchScript=document.createElement('script'); shareBatchScript.src='share-batch.js?v=20260812-4'; document.head.appendChild(shareBatchScript);
  const deleteFixScript=document.createElement('script'); deleteFixScript.src='delete-fix.js?v=20260812-4'; document.head.appendChild(deleteFixScript);
  const imageFixScript=document.createElement('script'); imageFixScript.src='icerik-gorsel-fix.js?v=20260812-4'; document.head.appendChild(imageFixScript);
  const infographicFixScript=document.createElement('script'); infographicFixScript.src='infografik-fix.js?v=20260812-4'; document.head.appendChild(infographicFixScript);

  function addStyle(){
    if(document.getElementById('bgysDbFixStyle'))return;
    const st=document.createElement('style'); st.id='bgysDbFixStyle'; st.textContent=`
      #konuList,#soruList,#soruSetiList,#soruCevapList,#denemeList{display:block!important;height:190px!important;max-height:190px!important;min-height:0!important;overflow-y:auto!important;overflow-x:hidden!important;padding:2px 8px 4px 0!important;margin:0!important;-webkit-overflow-scrolling:touch;}
      #konuList .item-card,#soruList .item-card,#soruSetiList .item-card,#soruCevapList .item-card,#denemeList .item-card{margin-bottom:8px!important;flex-shrink:0!important;}
    `; document.head.appendChild(st);
  }
  function start(){addStyle();setTimeout(addStyle,200);setTimeout(addStyle,1000)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
