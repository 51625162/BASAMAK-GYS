from pathlib import Path

p = Path('icerik-ekle.html')
s = p.read_text(encoding='utf-8')

old = """${s.status === 'pending' ? `
              <button class=\"btn primary small\" onclick=\"acceptIncomingShare('${s.id}')\">Kabul Et</button>
              <button class=\"btn danger small\" onclick=\"declineIncomingShare('${s.id}')\">Reddet</button>
            ` : ''}"""
new = """${s.status === 'pending' ? `
              <select class=\"share-target-select\" id=\"shareTarget-${s.id}\" onclick=\"event.stopPropagation()\" style=\"padding:8px 10px;border-radius:9px;border:1px solid var(--mist);font-weight:700;font-size:.78rem;background:white;color:var(--ink);\">
                <option value=\"saymanlik\">Saymanlık</option>
                <option value=\"ds-sefligi\">DS Şefliği</option>
                <option value=\"idare-memuru\">İdare Memuru</option>
              </select>
              <button class=\"btn primary small\" onclick=\"acceptIncomingShare('${s.id}', document.getElementById('shareTarget-${s.id}').value)\">Kabul Et</button>
              <button class=\"btn danger small\" onclick=\"declineIncomingShare('${s.id}')\">Reddet</button>
            ` : ''}"""
if old in s:
    s = s.replace(old, new, 1)
elif new not in s:
    raise SystemExit('incoming pending UI pattern not found')

old2 = """  window.acceptIncomingShare = async (shareId) => {
    await bgysAcceptShare(shareId);
    await refreshIncomingShares();
    renderKonuList(); renderSoruList(); renderSoruCevapList(); renderSoruSetiList(); renderDenemeList(); refreshBolumListesi();
  };"""
new2 = """  async function bgysAcceptShareToModul(shareId, targetModul) {
    const allowed = ['saymanlik', 'ds-sefligi', 'idare-memuru'];
    if (!allowed.includes(targetModul)) throw new Error('Geçersiz bölüm seçimi.');
    await bgysInitFirebase();
    const doc = await firebase.firestore().collection('shares').doc(shareId).get({source:'server'});
    if (!doc.exists) throw new Error('Paylaşım bulunamadı');
    const share = doc.data();
    if (share.status !== 'pending') throw new Error('Bu paylaşım daha önce işlendi.');
    const clone = {...share.record, modul: targetModul, createdAt: Date.now()};
    delete clone.denemeId;
    await bgysAdd(share.storeName, clone);
    await firebase.firestore().collection('shares').doc(shareId).update({status:'accepted', acceptedModul:targetModul, acceptedAt:Date.now()});
  }
  window.acceptIncomingShare = async (shareId, targetModul) => {
    try {
      await bgysAcceptShareToModul(shareId, targetModul || 'saymanlik');
      await refreshIncomingShares();
      renderKonuList(); renderSoruList(); renderSoruCevapList(); renderSoruSetiList(); renderDenemeList(); refreshBolumListesi();
    } catch (e) { alert('Paylaşım alınamadı: ' + e.message); }
  };"""
if old2 in s:
    s = s.replace(old2, new2, 1)
elif new2 not in s:
    raise SystemExit('accept function pattern not found')

marker = 'BGYS-PERSISTENT-SAVED-USERS-V1'
if marker not in s:
    patch = r'''<!-- BGYS-PERSISTENT-SAVED-USERS-V1 -->
<style>
#bgysGroupShareCard,#bgysSavedShareCard,#bgysQuickShareCard{display:none!important}
#bgysPersistentSavedUsers{border:1px solid var(--mist);background:var(--cloud);border-radius:16px;padding:16px;margin:16px 0}
#bgysPersistentSavedUsers h4{margin:0 0 5px;font-size:.98rem}
#bgysPersistentSavedUsers .help{margin:0 0 12px;color:var(--slate);font-size:.78rem;line-height:1.45}
#bgysPersistentSavedUsersList{display:flex;flex-direction:column;gap:7px;margin-bottom:12px}
.bgys-persist-user{display:flex;align-items:center;gap:7px;background:var(--white);border:1px solid var(--mist);border-radius:12px;padding:8px 9px}
.bgys-persist-user .pick{flex:1;text-align:left;background:transparent;color:var(--ink);font-size:.8rem;font-weight:700;padding:5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bgys-persist-user .remove{background:rgba(239,68,68,.1);color:#C0392B;border-radius:9px;padding:6px 8px;font-weight:800}
#bgysPersistentSavedUsersAdd{display:flex;gap:7px}
#bgysPersistentSavedUsersEmail{flex:1;min-width:0;padding:10px 12px;border-radius:11px;border:1.5px solid var(--mist);background:var(--white);font-size:.84rem}
#bgysPersistentSavedUsersAddBtn{background:var(--ink);color:#fff;border-radius:11px;padding:10px 13px;font-weight:700;font-size:.8rem}
</style>
<script>
(function(){
async function users(){await bgysInitFirebase();const u=bgysCurrentUser()||await bgysWaitForAuth();if(!u)return[];const s=await bgysUserCollection('paylasimKullanicilari').get({source:'server'});return s.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(a.email||'').localeCompare(b.email||'','tr'));}
async function addUser(email){const e=String(email||'').trim().toLowerCase();if(!e||!e.includes('@'))throw Error('Geçerli bir e-posta yaz.');await bgysInitFirebase();const u=bgysCurrentUser()||await bgysWaitForAuth();if(!u)throw Error('Giriş yapılmamış.');const id=encodeURIComponent(e).replace(/%/g,'_');await bgysUserCollection('paylasimKullanicilari').doc(id).set({email:e,createdAt:Date.now()},{merge:true});}
async function delUser(id){await bgysInitFirebase();const u=bgysCurrentUser()||await bgysWaitForAuth();if(!u)throw Error('Giriş yapılmamış.');await bgysUserCollection('paylasimKullanicilari').doc(String(id)).delete();}
function install(){const body=document.querySelector('#syncOverlay .sync-body'),bulk=document.getElementById('bulkShareResult');if(!body||!bulk||document.getElementById('bgysPersistentSavedUsers'))return;const c=document.createElement('div');c.id='bgysPersistentSavedUsers';c.innerHTML='<h4>👥 Kayıtlı Kullanıcılar</h4><p class="help">Buraya eklediğin kullanıcılar sen silene kadar kayıtlı kalır. Kullanıcıya tıklayınca paylaşım e-posta alanına aktarılır.</p><div id="bgysPersistentSavedUsersList">Yükleniyor...</div><div id="bgysPersistentSavedUsersAdd"><input id="bgysPersistentSavedUsersEmail" type="email" placeholder="kullanici@mail.com"><button id="bgysPersistentSavedUsersAddBtn">+ Kullanıcı Ekle</button></div>';bulk.parentNode.insertBefore(c,bulk.nextSibling);const list=document.getElementById('bgysPersistentSavedUsersList');async function load(){try{const a=await users();if(!a.length){list.innerHTML='<div style="color:var(--slate);font-size:.78rem">Henüz kayıtlı kullanıcı yok.</div>';return;}list.innerHTML=a.map(x=>'<div class="bgys-persist-user"><button class="pick" type="button" data-email="'+x.email+'">👤 '+x.email+'</button><button class="remove" type="button" data-id="'+x.id+'">🗑️</button></div>').join('');list.querySelectorAll('.pick').forEach(b=>b.onclick=()=>{document.getElementById('bulkShareEmail').value=b.dataset.email;});list.querySelectorAll('.remove').forEach(b=>b.onclick=async()=>{if(!confirm('Bu kayıtlı kullanıcı silinsin mi?'))return;await delUser(b.dataset.id);load();});}catch(e){list.textContent='Kullanıcılar yüklenemedi: '+e.message;}}document.getElementById('bgysPersistentSavedUsersAddBtn').onclick=async()=>{const i=document.getElementById('bgysPersistentSavedUsersEmail');try{await addUser(i.value);i.value='';load();}catch(e){alert(e.message);}};load();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
})();
</script>'''
    s = s.replace('</body>', patch + '\n</body>', 1)

p.write_text(s, encoding='utf-8')
print('patched icerik-ekle.html')