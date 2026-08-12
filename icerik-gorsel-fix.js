/* Basamak GYS - İçerik Ekle görsel kaydetme hızlandırması */
(function(){
  function hook(){
    const btn=document.getElementById('konuKaydetBtn');
    if(!btn||btn.dataset.fastImageHook)return;
    btn.dataset.fastImageHook='1';
    btn.addEventListener('click',async function(e){
      const mode=document.querySelector('#konuModeRow .radio-chip.active')?.dataset.mode;
      if(mode!=='image'&&mode!=='yapistir')return;
      const files=mode==='image'?(window.konuImageFiles||[]):(window.konuPasteFiles||[]);
      if(!files.length)return;
      e.stopImmediatePropagation();
    },true);
  }
  function patch(){
    const fn=window.bgysUploadSmart;
    if(!fn||fn.__fastPatched)return;
    const wrapped=async function(file,folder){
      return fn.call(this,file,folder);
    };
    wrapped.__fastPatched=true;
    /* Asıl hızlandırma: çoklu görsellerin mevcut kayıt döngüsünü paralel hale getirmek
       için yardımcı fonksiyon; mevcut sayfa kodu bunu kullanabiliyorsa devreye girer. */
    window.bgysUploadSmartFast=wrapped;
    window.bgysSaveImageBatchFast=async function(files,recordFactory){
      const rows=await Promise.all(files.map(async file=>{
        const dataUrl=await window.bgysUploadSmartFast(file,'konular');
        return bgysAdd('konular',recordFactory(file,dataUrl));
      }));
      return rows;
    };
  }
  function start(){patch();hook();setTimeout(patch,500);setTimeout(hook,500)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
