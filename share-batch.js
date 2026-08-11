/* Basamak GYS - gelişmiş içerik paylaşımı */
(function(){
  const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  function css(){
    if(document.getElementById('bgysBatchShareStyle'))return;
    const s=document.createElement('style');s.id='bgysBatchShareStyle';s.textContent=`
      #bgysAdvancedShareCard{border:1px solid var(--mist);background:var(--cloud);border-radius:16px;padding:16px;margin:16px 0}
      #bgysAdvancedShareCard h4{margin:0 0 5px;font-size:.98rem}.bgys-help{margin:0 0 12px;color:var(--slate);font-size:.78rem;line-height:1.45}
      #bgysAdvancedShareCard .grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.bgys-full{grid-column:1/-1}
      #bgysAdvancedShareCard label{display:block;font-size:.78rem;font-weight:700;margin-bottom:5px;color:var(--ink)}
      #bgysAdvancedShareCard input,#bgysAdvancedShareCard select{width:100%;padding:10px 11px;border-radius:11px;border:1.5px solid var(--mist);background:var(--white);color:var(--ink);font-size:.82rem}
      #bgysAdvancedShareCard .opts{display:flex;gap:12px;flex-wrap:wrap;margin:10px 0;font-size:.78rem}.bgys-check{display:flex!important;align-items:center;gap:6px;margin:0!important;font-weight:600!important}.bgys-check input{width:16px!important;height:16px}
      #bgysBatchItemWrap{display:none;margin-top:10px}.bgys-item-select{max-height:180px;overflow:auto;border:1px solid var(--mist);border-radius:11px;background:#fff;padding:6px}.bgys-item-row{display:flex;gap:7px;align-items:center;padding:7px;border-bottom:1px solid var(--mist);font-size:.76rem}.bgys-item-row:last-child{border-bottom:0}.bgys-item-row input{width:16px!important;flex:0 0 auto}.bgys-item-row span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      #bgysBatchShareBtn{width:100%;justify-content:center;margin-top:8px}#bgysBatchShareResult{margin-top:10px;padding:10px 12px;border-radius:10px;font-size:.78rem;line-height:1.45;display:none}
      #bgysBatchShareResult.ok{display:block;background:rgba(34,197,94,.1);color:#16803C}#bgysBatchShareResult.warn{display:block;background:rgba(245,166,35,.12);color:#B0740F}#bgysBatchShareResult.err{display:block;background:rgba(239,68,68,.1);color:#C0392B}
      @media(max-width:600px){#bgysAdvancedShareCard .grid{grid-template-columns:1fr}.bgys-full{grid-column:auto}}
    `;document.head.appendChild(s);
  }
  function hideOld(){['bulkShareEmail','bulkShareScope','bulkShareBolum','bulkShareBtn','bulkShareResult'].forEach(id=>{const e=document.getElementById(id);if(e)(e.closest('.field')||e).style.display='none'});const sync=document.querySelector('#syncOverlay .sync-body');if(!sync)return;[...sync.querySelectorAll('h4')].filter(x=>x.textContent.includes('Toplu Paylaşım')).forEach(x=>x.style.display='none');[...sync.querySelectorAll('.sync-lead')].filter(x=>x.textContent.includes('Tek tek değil')).forEach(x=>x.style.display='none');}
  function recipient(email){const a=document.getElementById('bulkShareEmail'),b=document.getElementById('bgysBatchShareEmail');if(a)a.value=email||'';if(b)b.value=email||'';}
  function key(store,r){const c={...r};['id','modul','moduller','createdAt','deleted','deletedAt','_recentAt'].forEach(k=>delete c[k]);return store+'|'+JSON.stringify(c)}
  async function sentKeys(email){await bgysInitFirebase();const u=bgysCurrentUser()||await bgysWaitForAuth();if(!u)return new Set();const snap=await firebase.firestore().collection('shares').where('fromEmail','==',u.email.toLowerCase()).get({source:'server'}),set=new Set(),to=email.toLowerCase();snap.docs.forEach(d=>{const s=d.data();if(String(s.toEmail||'').toLowerCase()===to&&s.record&&s.storeName)set.add(key(s.storeName,s.record))});return set;}
  async function allItems(type,group){
    let items=[];
    if(type==='konuGorselleri'){
      (await bgysGetAllByModul('konular')).filter(r=>r.tip==='image'&&(!group||r.bolum===group)).forEach(r=>items.push({st:'konular',r}));
    }else if(type==='all'){
      for(const st of ['konular','sorular','soruCevap','denemeler'])(await bgysGetAllByModul(st)).filter(r=>!group||r.bolum===group).forEach(r=>items.push({st,r}));
    }else{
      (await bgysGetAllByModul(type)).filter(r=>!group||r.bolum===group).forEach(r=>items.push({st:type,r}));
    }
    return items.sort((a,b)=>(a.r.createdAt||0)-(b.r.createdAt||0));
  }
  async function groups(type){
    const items=await allItems(type,'');const set=new Set();items.forEach(x=>{if(x.r.bolum)set.add(x.r.bolum)});return [...set].sort((a,b)=>a.localeCompare(b,'tr'));
  }
  async function fillGroups(){const t=document.getElementById('bgysBatchShareType'),g=document.getElementById('bgysBatchShareGroup');if(!t||!g)return;const old=g.value;g.innerHTML='<option value="">Tüm dersler / konular</option>';for(const x of await groups(t.value)){const o=document.createElement('option');o.value=x;o.textContent=x;g.appendChild(o)}if([...g.options].some(o=>o.value===old))g.value=old;await refreshItemChoices();}
  async function refreshItemChoices(){
    const t=document.getElementById('bgysBatchShareType'),m=document.getElementById('bgysBatchShareMode'),wrap=document.getElementById('bgysBatchItemWrap'),box=document.getElementById('bgysBatchItemList');if(!t||!m||!wrap||!box)return;
    const needs=(t.value==='konuGorselleri'||t.value==='soruCevap')&&m.value==='single';wrap.style.display=needs?'block':'none';if(!needs){box.innerHTML='';return}
    const items=await allItems(t.value,document.getElementById('bgysBatchShareGroup')?.value||'');box.innerHTML=items.length?items.map((x,i)=>`<label class="bgys-item-row"><input type="radio" name="bgysBatchItem" value="${esc(x.r.id)}" ${i===0?'checked':''}><span>${esc(x.r.baslik||x.r.soru||x.r.question||x.r.fileName||('İçerik '+(i+1)))}</span></label>`).join(''):'<div style="padding:8px;color:var(--slate);font-size:.76rem">Bu seçimde içerik yok.</div>';
  }
  function updateModeUI(){
    const t=document.getElementById('bgysBatchShareType'),m=document.getElementById('bgysBatchShareMode'),b=document.getElementById('bgysBatchShareBtn');if(!t||!m||!b)return;
    const v=t.value;
    if(v==='konuGorselleri'){m.innerHTML='<option value="all">Tüm görseller</option><option value="single">Tek tek görsel</option>';b.textContent='📤 Görselleri Gönder';}
    else if(v==='soruCevap'){m.innerHTML='<option value="all">Tümü</option><option value="batch10">10\'arlı grup</option><option value="single">Tek tek</option>';b.textContent='📤 Soru-Cevap Gönder';}
    else if(v==='sorular'){m.innerHTML='<option value="batch100">100\'lü grup</option><option value="single">Tek tek</option><option value="all">Tümü</option>';b.textContent='📤 Soruları Gönder';}
    else {m.innerHTML='<option value="batch100">100\'lü grup</option><option value="all">Tümü</option>';b.textContent='📤 İçeriği Gönder';}
    refreshItemChoices();
  }
  async function sendBatch(){
    const email=(document.getElementById('bgysBatchShareEmail')?.value||'').trim().toLowerCase(),type=document.getElementById('bgysBatchShareType')?.value||'sorular',mode=document.getElementById('bgysBatchShareMode')?.value||'batch100',group=document.getElementById('bgysBatchShareGroup')?.value||'',repeat=document.getElementById('bgysBatchRepeat')?.checked,result=document.getElementById('bgysBatchShareResult'),btn=document.getElementById('bgysBatchShareBtn');
    if(!email||!email.includes('@')){result.className='err';result.textContent='Geçerli bir kullanıcı e-postası seç veya yaz.';return}
    btn.disabled=true;btn.style.opacity='.6';result.className='warn';result.textContent='İçerikler hazırlanıyor...';
    try{
      const all=await allItems(type,group),sent=repeat?new Set():await sentKeys(email),available=all.filter(x=>repeat||!sent.has(key(x.st,x.r)));
      let selected=available;
      if(mode==='single'){const id=document.querySelector('input[name="bgysBatchItem"]:checked')?.value;selected=available.filter(x=>String(x.r.id)===String(id)).slice(0,1);}
      else if(mode==='batch10')selected=available.slice(0,10);
      else if(mode==='batch100')selected=available.slice(0,100);
      if(!selected.length){result.className='ok';result.textContent=repeat?'Gönderilecek içerik bulunamadı.':'Bu seçimde daha önce gönderilmemiş içerik kalmadı. Yeniden göndermek için "Tekrar göndermeye izin ver" seçeneğini aç.';return}
      for(let i=0;i<selected.length;i+=10){const p=selected.slice(i,i+10);await Promise.all(p.map(x=>bgysShareItem(x.st,x.r.id,email)));result.textContent=`Paylaşılıyor... ${Math.min(i+10,selected.length)}/${selected.length}`;}
      const left=available.length-selected.length;result.className='ok';result.textContent=`✅ ${selected.length} içerik gönderildi.${left?` Kalan yeni içerik: ${left}.`:''}`;
      if(left&&mode==='batch10')result.textContent+=` Tekrar tıklarsan sonraki 10 gönderilir.`;if(left&&mode==='batch100')result.textContent+=` Tekrar tıklarsan sonraki 100 gönderilir.`;
    }catch(e){result.className='err';result.textContent='Paylaşım hatası: '+e.message}finally{btn.disabled=false;btn.style.opacity='1';}
  }
  function install(){
    css();hideOld();const body=document.querySelector('#syncOverlay .sync-body'),saved=document.getElementById('bgysPersistentSavedUsers');if(!body||!saved||document.getElementById('bgysAdvancedShareCard'))return;
    const c=document.createElement('div');c.id='bgysAdvancedShareCard';c.innerHTML=`<h4>📤 İçerik Paylaş</h4><p class="bgys-help"><b>5275 SAYILI KANUN</b> gibi bir konu seç. Konu görsellerini <b>tamamını veya tek tek</b>, Soru-Cevapları <b>tamamını, 10'ar veya tek tek</b> gönderebilirsin. Daha önce gönderilenler varsayılan olarak tekrar gönderilmez.</p><div class="grid"><div class="bgys-full"><label>Paylaşılacak kullanıcı</label><input id="bgysBatchShareEmail" type="email" placeholder="kullanici@mail.com"></div><div><label>Ders / Konu</label><select id="bgysBatchShareGroup"><option value="">Yükleniyor...</option></select></div><div><label>İçerik türü</label><select id="bgysBatchShareType"><option value="konuGorselleri">🖼️ Konu Görselleri</option><option value="soruCevap">📇 Soru-Cevap</option><option value="sorular">❓ Sorular</option><option value="konular">📘 Tüm Konu İçerikleri</option><option value="denemeler">📝 Denemeler</option><option value="all">📚 Tümü</option></select></div><div><label>Gönderme şekli</label><select id="bgysBatchShareMode"></select></div></div><div class="opts"><label class="bgys-check"><input type="checkbox" id="bgysBatchRepeat"> Tekrar göndermeye izin ver</label></div><div id="bgysBatchItemWrap"><label>Tek tek gönderilecek içerik</label><div id="bgysBatchItemList" class="bgys-item-select"></div></div><button class="btn primary" id="bgysBatchShareBtn">📤 Gönder</button><div id="bgysBatchShareResult"></div>`;
    saved.insertAdjacentElement('afterend',c);
    const t=document.getElementById('bgysBatchShareType'),g=document.getElementById('bgysBatchShareGroup'),m=document.getElementById('bgysBatchShareMode');t.onchange=async()=>{updateModeUI();await fillGroups();};g.onchange=refreshItemChoices;m.onchange=refreshItemChoices;document.getElementById('bgysBatchShareBtn').onclick=sendBatch;updateModeUI();fillGroups();
    const list=document.getElementById('bgysPersistentSavedUsersList');if(list)list.addEventListener('click',e=>{const b=e.target.closest('.pick');if(b)recipient(b.dataset.email)});
  }
  const start=()=>{install();setTimeout(install,300);setTimeout(install,1000)};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
