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

if old not in s:
    raise SystemExit('incoming pending UI pattern not found')
s = s.replace(old, new, 1)

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
    } catch (e) {
      alert('Paylaşım alınamadı: ' + e.message);
    }
  };"""

if old2 not in s:
    raise SystemExit('accept function pattern not found')
s = s.replace(old2, new2, 1)
p.write_text(s, encoding='utf-8')
print('patched icerik-ekle.html')