/* BASAMAK-GYS - Görsel kayıt/listeme dayanıklılık katmanı */
(function(){
  if(!/icerik-ekle\.html$/i.test(location.pathname)) return;
  const wait=ms=>new Promise(r=>setTimeout(r,ms));

  async function imageToSafeDataUrl(file){
    if(!file || !file.type || !file.type.startsWith('image/')) return null;
    try{
      const bitmap=await createImageBitmap(file);
      const maxSide=1800;
      const ratio=Math.min(1,maxSide/Math.max(bitmap.width,bitmap.height));
      const w=Math.max(1,Math.round(bitmap.width*ratio));
      const h=Math.max(1,Math.round(bitmap.height*ratio));
      const canvas=document.createElement('canvas');
      canvas.width=w; canvas.height=h;
      const ctx=canvas.getContext('2d',{alpha:false});
      ctx.drawImage(bitmap,0,0,w,h);
      bitmap.close();
      let quality=.82;
      for(let i=0;i<6;i++){
        const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));
        if(!blob) throw new Error('Görsel sıkıştırılamadı');
        if(blob.size*1.37<=760000){
          return await new Promise((resolve,reject)=>{
            const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(blob);
          });
        }
        quality-=.1;
      }
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.3));
      return await new Promise((resolve,reject)=>{
        const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(blob);
      });
    }catch(e){
      console.warn('Görsel sıkıştırma başarısız:',e);
      return null;
    }
  }

  const originalUpload=window.bgysUploadSmart;
  if(typeof originalUpload==='function'){
    window.bgysUploadSmart=async function(file,folder){
      if(file && file.type && file.type.startsWith('image/')){
        const safe=await imageToSafeDataUrl(file);
        if(safe && safe.length<=780000) return safe;
      }
      return originalUpload(file,folder);
    };
  }

  function fixListHeight(){
    document.querySelectorAll('#konuList.scroll-list').forEach(el=>{
      el.style.maxHeight='430px';el.style.overflowY='auto';
    });
    document.querySelectorAll('#konuList .konu-group-body').forEach(el=>{
      el.style.maxHeight='430px';el.style.overflowY='auto';
    });
  }

  async function refresh(){
    fixListHeight();
    try{
      if(typeof window.renderKonuList==='function') await window.renderKonuList();
    }catch(e){console.warn('Konu listesi yenilenemedi:',e);}
  }

  function start(){[0,500,1200,2500].forEach(ms=>setTimeout(refresh,ms));}
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start); else start();
})();
