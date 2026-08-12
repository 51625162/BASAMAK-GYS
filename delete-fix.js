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
