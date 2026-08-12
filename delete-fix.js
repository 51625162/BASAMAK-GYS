/* Basamak GYS - içerik silme düzeltmesi */
(function(){
  async function deleteKonuFixed(id){
    const u=bgysCurrentUser()||await bgysWaitForAuth();
    if(!u) throw new Error('Giriş yapılmamış.');
    await bgysInitFirebase();
    const ref=bgysUserCollection('konular').doc(String(id));
    const snap=await ref.get({source:'server'});
    if(!snap.exists) throw new Error('Kayıt sunucuda bulunamadı. Sayfayı yenileyip tekrar dene.');
    const data=snap.data()||{};
    const current=bgysCurrentModul();
    const mods=bgysModulesOf(data).filter(x=>x!==current);
    if(mods.length){
      await ref.set({moduller:mods,modul:mods[0]},{merge:true});
    }else{
      await ref.set({deleted:true,deletedAt:Date.now()},{merge:true});
    }
    if(typeof window.renderKonuList==='function') await window.renderKonuList();
    else if(typeof renderKonuList==='function') await renderKonuList();
  }

  function install(){
    if(typeof window.bgysDeleteKonu==='function'){
      window.bgysDeleteKonu=async function(id){
        if(!confirm('Bu konu notu silinsin mi?')) return;
        try{
          await deleteKonuFixed(id);
        }catch(e){
          alert('Silme hatası: '+(e&&e.message?e.message:e));
        }
      };
    }
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(install,100));
  else setTimeout(install,100);
  setTimeout(install,500);
  setTimeout(install,1500);
})();

/* İçerik Ekle - eski/alternatif görsel alanlarını da gösterme düzeltmesi */
(function(){
  function imageSrc(it){
    return [it&&it.dataUrl,it&&it.imageDataUrl,it&&it.downloadURL,it&&it.fileUrl,it&&it.imageUrl,it&&it.gorselUrl,it&&it.url,it&&it.src,it&&it.image]
      .find(v=>typeof v==='string' && v.trim());
  }
  function esc(v){return String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}
  async function repairKonuImages(){
    if(!location.pathname.endsWith('icerik-ekle.html'))return;
    const list=document.getElementById('konuList');
    if(!list || typeof bgysGetAllByModul!=='function')return;
    try{
      const items=(await bgysGetAllByModul('konular')).filter(x=>x.tip==='image');
      const cards=[...list.querySelectorAll('.item-card')];
      cards.forEach(card=>{
        const title=(card.querySelector('.item-info h4')?.textContent||'').trim();
        const section=(card.querySelector('.item-info .tag')?.textContent||'').trim();
        const fileText=(card.querySelector('.item-info p')?.textContent||'').trim();
        const candidates=items.filter(it=>String(it.baslik||'').trim()===title && String(it.bolum||'').trim()===section);
        const item=candidates.find(it=>it.fileName && fileText.includes(it.fileName))||candidates[0];
        if(!item)return;
        const src=imageSrc(item);
        const img=card.querySelector('img.item-thumb');
        if(!img)return;
        if(src && (!img.getAttribute('src') || img.getAttribute('src')==='undefined' || img.getAttribute('src')==='null')) img.src=src;
        img.onerror=()=>{
          const fallback=imageSrc(item);
          if(fallback && img.src!==fallback){img.src=fallback;return;}
          img.onerror=null;
          img.style.objectFit='contain';
          img.alt='Görsel yüklenemedi';
        };
      });
    }catch(e){console.warn('Görsel liste düzeltmesi:',e)}
  }
  function start(){
    repairKonuImages();
    [250,700,1500,3000].forEach(ms=>setTimeout(repairKonuImages,ms));
    const list=document.getElementById('konuList');
    if(list && window.MutationObserver){new MutationObserver(()=>repairKonuImages()).observe(list,{childList:true,subtree:true});}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
