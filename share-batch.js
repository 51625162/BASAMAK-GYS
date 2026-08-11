/* Basamak GYS - 100'lü akıllı toplu paylaşım */
(function(){
  function css(){
    if(document.getElementById('bgysBatchShareStyle'))return;
    const s=document.createElement('style');s.id='bgysBatchShareStyle';
    s.textContent=`
      #bgysAdvancedShareCard{border:1px solid var(--mist);background:var(--cloud);border-radius:16px;padding:16px;margin:16px 0}
      #bgysAdvancedShareCard h4{margin:0 0 5px;font-size:.98rem}
      #bgysAdvancedShareCard .help{margin:0 0 12px;color:var(--slate);font-size:.78rem;line-height:1.45}
      #bgysAdvancedShareCard .grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      #bgysAdvancedShareCard .full{grid-column:1/-1}
      #bgysAdvancedShareCard label{display:block;font-size:.78rem;font-weight:700;margin-bottom:5px;color:var(--ink)}
      #bgysAdvancedShareCard input,#bgysAdvancedShareCard select{width:100%;padding:10px 11px;border-radius:11px;border:1.5px solid var(--mist);background:var(--white);color:var(--ink);font-size:.82rem}
      #bgysAdvancedShareCard .opts{display:flex;gap:12px;flex-wrap:wrap;margin:10px 0;font-size:.78rem}
      #bgysAdvancedShareCard .opts label{display:flex;align-items:center;gap:6px;margin:0;font-weight:600}
      #bgysAdvancedShareCard .opts input{width:16px;height:16px;padding:0}
      #bgysBatchShareBtn{width:100%;justify-content:center;margin-top:4px}
      #bgysBatchShareResult{margin-top:10px;padding:10px 12px;border-radius:10px;font-size:.78rem;line-height:1.45;display:none}
      #bgysBatchShareResult.ok{display:block;background:rgba(34,197,94,.1);color:#16803C}
      #bgysBatchShareResult.warn{display:block;background:rgba(245,166,35,.12);color:#B0740F}
      #bgysBatchShareResult.err{display:block;background:rgba(239,68,68,.1);color:#C0392B}
      @media(max-width:600px){#bgysAdvancedShareCard .grid{grid-template-columns:1fr}#bgysAdvancedShareCard .full{grid-column:auto}}
    `;document.head.appendChild(s);
  }
  function hideOld(){
    ['bulkShareEmail','bulkShareScope','bulkShareBolum','bulkShareBtn','bulkShareResult'].forEach(id=>{const e=document.getElementById(id);if(e)(e.closest('.field')||e).style.display='none'});
    const sync=document.querySelector('#syncOverlay .sync-body');if(!sync)return;
    [...sync.querySelectorAll('h4')].filter(x=>x.textContent.includes('Toplu Paylaşım')).forEach(x=>x.style.display='none');
    [...sync.querySelectorAll('.sync-lead')].filter(x=>x.textContent.includes('Tek tek değil')).forEach(x=>x.style.display='none');
  }
  function recipient(email){
    const a=document.getElementById('bulkShareEmail'),b=document.getElementById('bgysBatchShareEmail');if(a)a.value=email||'';if(b)b.value=email||'';
  }
  async function groups(type){
    const stores=type==='all'?['konular','sorular','soruCevap','denemeler']:[type],set=new Set();
    for(const st of stores)(await bgysGetAllByModul(st)).forEach(r=>{if(r.bolum)set.add(r.bolum)});
    return [...set].sort((a,b)=>a.localeCompare(b,'tr'));
  }
  async function fillGroups(){
    const t=document.getElementById('bgysBatchShareType'),g=document.getElementById('bgysBatchShareGroup');if(!t||!g)return;
    const old=g.value;g.innerHTML='<option value="">Tüm dersler / konular</option>';
    for(const x of await groups(t.value)){const o=document.createElement('option');o.value=x;o.textContent=x;g.appendChild(o)}
    if([...g.options].some(o=>o.value===old))g.value=old;
  }
  function key(store,r){
    const c={...r};['id','modul','moduller','createdAt','deleted','deletedAt','_recentAt'].forEach(k=>delete c[k]);return store+'|'+JSON.stringify(c)
  }
  async function sentKeys(email){
    await bgysInitFirebase();const u=bgysCurrentUser()||await bgysWaitForAuth();if(!u)return new Set();
    const snap=await firebase.firestore().collection('shares').where('fromEmail','==',u.email.toLowerCase()).get({source:'server'}),set=new Set(),to=email.toLowerCase();
    snap.docs.forEach(d=>{const s=d.data();if(String(s.toEmail||'').toLowerCase()===to&&s.record&&s.storeName)set.add(key(s.storeName,s.record))});return set;
  }
  async function sendBatch(){
    const email=(document.getElementById('bgysBatchShareEmail')?.value||'').trim().toLowerCase(),type=document.getElementById('bgysBatchShareType')?.value||'sorular',group=document.getElementById('bgysBatchShareGroup')?.value||'',skip=document.getElementById('bgysBatchSkipSent')?.checked&&!document.getElementById('bgysBatchRepeat')?.checked,result=document.getElementById('bgysBatchShareResult'),btn=document.getElementById('bgysBatchShareBtn');
    if(!email||!email.includes('@')){result.className='err';result.textContent='Geçerli bir kullanıcı e-postası seç veya yaz.';return}
    btn.disabled=true;btn.style.opacity='.6';result.className='warn';result.textContent='Sorular hazırlanıyor...';
    try{
      const stores=type==='all'?['konular','sorular','soruCevap','denemeler']:[type],items=[];
      for(const st of stores)(await bgysGetAllByModul(st)).filter(r=>!group||r.bolum===group).forEach(r=>items.push({st,r}));
      items.sort((a,b)=>(a.r.createdAt||0)-(b.r.createdAt||0));
      const sent=skip?await sentKeys(email):new Set(),available=items.filter(x=>!skip||!sent.has(key(x.st,x.r))),batch=available.slice(0,100);
      if(!batch.length){result.className='ok';result.textContent='Bu seçim için gönderilecek yeni içerik kalmadı. Aynılarını göndermek için tekrar gönderme seçeneğini aç.';return}
      for(let i=0;i<batch.length;i+=10){const p=batch.slice(i,i+10);await Promise.all(p.map(x=>bgysShareItem(x.st,x.r.id,email)));result.textContent=`Paylaşılıyor... ${Math.min(i+10,batch.length)}/${batch.length}`}
      const left=available.length-batch.length;result.className='ok';result.textContent=`✅ ${batch.length} içerik gönderildi. ${left?`Kalan yeni içerik: ${left}. Tekrar tıklarsan sonraki 100 gönderilir.`:'Yeni içerik kalmadı.'}`;
    }catch(e){result.className='err';result.textContent='Paylaşım hatası: '+e.message}
    finally{btn.disabled=false;btn.style.opacity='1'}
  }
  function install(){
    css();hideOld();
    const body=document.querySelector('#syncOverlay .sync-body'),saved=document.getElementById('bgysPersistentSavedUsers');
    if(!body||!saved||document.getElementById('bgysAdvancedShareCard'))return;
    const c=document.createElement('div');c.id='bgysAdvancedShareCard';c.innerHTML=`<h4>📤 İçerik Paylaş</h4><p class="help">Örneğin <b>5275 SAYILI KANUN</b> seçip sadece <b>Sorular</b>, <b>Konular</b> veya <b>Soru-Cevap</b> gönderebilirsin. Sorular 100'erli gruplar hâlinde gider.</p><div class="grid"><div class="full"><label>Paylaşılacak kullanıcı</label><input id="bgysBatchShareEmail" type="email" placeholder="kullanici@mail.com"></div><div><label>Ders / Konu</label><select id="bgysBatchShareGroup"><option value="">Yükleniyor...</option></select></div><div><label>İçerik türü</label><select id="bgysBatchShareType"><option value="sorular">❓ Sorular</option><option value="konular">📘 Konular</option><option value="soruCevap">📇 Soru-Cevap</option><option value="denemeler">📝 Denemeler</option><option value="all">📚 Tümü</option></select></div></div><div class="opts"><label><input type="checkbox" id="bgysBatchSkipSent" checked> Daha önce gönderilenleri tekrar gönderme</label><label><input type="checkbox" id="bgysBatchRepeat"> Tekrar göndermeye izin ver</label></div><button class="btn primary" id="bgysBatchShareBtn">📤 100'lü Grubu Gönder</button><div id="bgysBatchShareResult"></div>`;
    saved.insertAdjacentElement('afterend',c);
    document.getElementById('bgysBatchShareType').onchange=fillGroups;document.getElementById('bgysBatchShareBtn').onclick=sendBatch;fillGroups();
    const list=document.getElementById('bgysPersistentSavedUsersList');if(list)list.addEventListener('click',e=>{const b=e.target.closest('.pick');if(b)recipient(b.dataset.email)});
  }
  const start=()=>{install();setTimeout(install,300);setTimeout(install,1000)};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
