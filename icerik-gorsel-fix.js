/* BASAMAK-GYS - İçerik Ekle görsel dayanıklılık katmanı
   Mevcut kayıt/yazma mantığını değiştirmez. Sadece geçici okuma/yükleme hatalarında
   yeniden dener ve görsel listelemesini güvenilir hale getirir. */
(function(){
  if(!/icerik-ekle\.html$/i.test(location.pathname)) return;

  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  let patched=false;

  async function withRetry(fn, attempts=4){
    let last;
    for(let i=0;i<attempts;i++){
      try{return await fn();}
      catch(e){last=e;await wait(350*(i+1));}
    }
    throw last;
  }

  async function refreshImages(){
    try{
      if(typeof bgysGetAllByModul!=='function') return;
      const items=await withRetry(()=>bgysGetAllByModul('konular'),3);
      const imageItems=items.filter(x=>x.tip==='image');
      const list=document.getElementById('konuList');
      if(!list) return;
      list.querySelectorAll('img.item-thumb').forEach(img=>{
        img.loading='lazy';
        img.decoding='async';
        img.addEventListener('error',function(){
          if(this.dataset.bgysRetried)return;
          this.dataset.bgysRetried='1';
          const src=this.getAttribute('src');
          if(src && /^https?:/i.test(src)) this.src=src+(src.includes('?')?'&':'?')+'bgysRetry='+Date.now();
        },{once:true});
      });
      // Sunucudan kayıt geldiği halde liste boş kaldıysa mevcut render fonksiyonunu
      // tekrar çalıştır. Kayıt ekleme/silme/veri şemasına dokunulmaz.
      if(imageItems.length && !list.querySelector('.item-card')){
        if(typeof window.renderKonuList==='function') await window.renderKonuList();
      }
    }catch(e){console.warn('BGYS görsel dayanıklılık kontrolü:',e)}
  }

  function patchRender(){
    if(patched || typeof window.renderKonuList!=='function') return;
    const original=window.renderKonuList;
    window.renderKonuList=async function(){
      let last;
      for(let i=0;i<3;i++){
        try{
          const result=await original.apply(this,arguments);
          await refreshImages();
          return result;
        }catch(e){
          last=e;
          await wait(400*(i+1));
        }
      }
      throw last;
    };
    patched=true;
  }

  function start(){
    patchRender();
    setTimeout(patchRender,250);
    setTimeout(patchRender,800);
    setTimeout(patchRender,1500);
    // İlk açılışta geçici Firebase/auth gecikmesi olursa listeyi birkaç kez kontrol et.
    [700,1600,3000,5000].forEach(ms=>setTimeout(()=>{
      patchRender();
      refreshImages();
    },ms));
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
