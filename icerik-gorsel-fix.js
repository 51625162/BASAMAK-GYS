/* BASAMAK-GYS - Görsel kayıt/listeme dayanıklılık katmanı */
(function(){
  if(!/icerik-ekle\.html$/i.test(location.pathname)) return;

  // Firestore dokümanı 1 MiB sınırına yaklaşmasın diye görselleri her durumda
  // küçük, güvenli bir JPEG dataURL'a çeviriyoruz. Böylece Storage kapalı olsa bile
  // "Kayıt hatası" oluşmamalı.
  async function imageToSafeDataUrl(file){
    if(!file || !file.type || !file.type.startsWith('image/')) return null;
    try{
      const bitmap=await createImageBitmap(file);
      const maxSide=1400;
      let ratio=Math.min(1,maxSide/Math.max(bitmap.width,bitmap.height));
      let w=Math.max(1,Math.round(bitmap.width*ratio));
      let h=Math.max(1,Math.round(bitmap.height*ratio));
      const canvas=document.createElement('canvas');
      const ctx=canvas.getContext('2d',{alpha:false});

      // Hedef: dataURL <= 600 KB. Bu, Firestore kayıt limiti için geniş güvenlik payı bırakır.
      for(let pass=0; pass<5; pass++){
        canvas.width=w; canvas.height=h;
        ctx.clearRect(0,0,w,h);
        ctx.drawImage(bitmap,0,0,w,h);

        for(const quality of [0.78,0.62,0.48,0.36,0.25]){
          const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));
          if(!blob) continue;
          const dataUrl=await new Promise((resolve,reject)=>{
            const r=new FileReader();
            r.onload=()=>resolve(r.result);
            r.onerror=reject;
            r.readAsDataURL(blob);
          });
          if(dataUrl && dataUrl.length<=600000){
            bitmap.close();
            return dataUrl;
          }
        }

        // Hâlâ büyükse çözünürlüğü bir kademe daha düşür.
        w=Math.max(480,Math.round(w*0.72));
        h=Math.max(480,Math.round(h*0.72));
      }

      // Son güvenlik denemesi: küçük çözünürlük + düşük kalite.
      canvas.width=Math.min(w,900);
      canvas.height=Math.min(h,900);
      ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
      const finalBlob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.18));
      bitmap.close();
      if(!finalBlob) return null;
      return await new Promise((resolve,reject)=>{
        const r=new FileReader();
        r.onload=()=>resolve(r.result);
        r.onerror=reject;
        r.readAsDataURL(finalBlob);
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
        if(safe && safe.length<=650000) return safe;
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
