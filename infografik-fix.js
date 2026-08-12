/* Basamak GYS - İnfografik düzenleme/silme düzeltmesi */
(function(){
  const STORE='konular';
  const HIDDEN='infografikHidden';
  const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;').replace(/'/g,'&#39;');
  const groupKey=x=>(x.bolum||'Diğer').trim()||'Diğer';
  const num=x=>Number.isFinite(Number(x.sortOrder))?Number(x.sortOrder):null;
  const sorted=a=>a.slice().sort((x,y)=>{
    const xo=num(x),yo=num(y);
    if(xo!==null&&yo!==null&&xo!==yo)return xo-yo;
    if(xo!==null&&yo===null)return -1;
    if(xo===null&&yo!==null)return 1;
    return (Number(x.createdAt)||0)-(Number(y.createdAt)||0);
  });
  const data={};
  let groupsCache={};

  async function read(){
    const all=await bgysGetAllByModul(STORE);
    return all.filter(x=>x.tip==='image'&&!x[HIDDEN]);
  }
  async function ensureOrders(items){
    const by={};
    items.forEach(x=>(by[groupKey(x)]??=[]).push(x));
    for(const [g,arr] of Object.entries(by)){
      const s=sorted(arr);
      const changed=s.some((x,i)=>num(x)!==i);
      if(changed){
        for(let i=0;i<s.length;i++){
          s[i].sortOrder=i;
          await bgysUserCollection(STORE).doc(String(s[i].id)).update({sortOrder:i});
        }
      }
    }
  }
  async function removeFromInfographic(id){
    const it=data[id];
    if(!it)return;
    const ok=confirm('Bu görsel İnfografikler listesinden kaldırılacak.\n\nİçerik Ekle bölümündeki asıl kayıt SİLİNMEYECEK.\n\nDevam edilsin mi?');
    if(!ok)return;
    await bgysInitFirebase();
    await bgysUserCollection(STORE).doc(String(id)).update({[HIDDEN]:true,infografikHiddenAt:Date.now()});
    await render();
  }
  async function move(id,delta){
    const it=data[id];if(!it)return;
    const g=groupKey(it);const arr=groupsCache[g]||[];const i=arr.findIndex(x=>String(x.id)===String(id));const j=i+delta;
    if(i<0||j<0||j>=arr.length)return;
    [arr[i],arr[j]]=[arr[j],arr[i]];
    await saveOrder(arr);
  }
  async function setPosition(id,value){
    const it=data[id];if(!it)return;
    const g=groupKey(it);const arr=(groupsCache[g]||[]).slice();const from=arr.findIndex(x=>String(x.id)===String(id));
    let to=Math.max(0,Math.min(arr.length-1,parseInt(value,10)-1));
    if(from<0||Number.isNaN(to))return;
    const [item]=arr.splice(from,1);arr.splice(to,0,item);await saveOrder(arr);
  }
  async function saveOrder(arr){
    await bgysInitFirebase();
    for(let i=0;i<arr.length;i++){
      arr[i].sortOrder=i;
      await bgysUserCollection(STORE).doc(String(arr[i].id)).update({sortOrder:i});
    }
    await render();
  }
  window.bgysInfografikDelete=removeFromInfographic;
  window.bgysInfografikMove=move;
  window.bgysInfografikSetPosition=setPosition;

  async function render(){
    try{
      const items=await read();
      await ensureOrders(items);
      const fresh=await read();
      Object.keys(data).forEach(k=>delete data[k]);fresh.forEach(x=>data[x.id]=x);
      groupsCache={};fresh.forEach(x=>(groupsCache[groupKey(x)]??=[]).push(x));Object.keys(groupsCache).forEach(k=>groupsCache[k]=sorted(groupsCache[k]));
      const root=document.getElementById('groups'),empty=document.getElementById('empty');if(!root)return;
      if(!fresh.length){root.innerHTML='';root.style.display='none';if(empty)empty.style.display='block';return}
      if(empty)empty.style.display='none';root.style.display='block';
      root.innerHTML=Object.entries(groupsCache).map(([bolum,arr],gi)=>{const gid='bgfix-'+gi;return `<section class="group open" id="${gid}"><button class="group-head" onclick="document.getElementById('${gid}').classList.toggle('open')"><span class="group-head-main"><span><span class="group-title">${esc(bolum)}</span><span class="group-count">${arr.length} içerik</span></span></span><span class="group-tools"><span class="reorder-toggle" onclick="event.stopPropagation();document.getElementById('${gid}').classList.toggle('reorder-open')">↕️ Sırala</span><span class="group-arrow">▼</span></span></button><div class="group-body">${arr.map((it,i)=>`<article class="g-card"><div class="g-thumb" onclick="openLightbox('${it.id}')"><img src="${esc(it.dataUrl)}" alt="${esc(it.baslik||'Görsel')}"></div><div class="g-info"><span class="g-tag">${it.kaynak==='yapistir'?'📋 Yapıştır':'🖼️ Görsel'}</span><h3>${esc(it.baslik||'Görsel konu notu')}</h3><div class="g-actions"><button class="g-btn" onclick="openLightbox('${it.id}')">👁️ Görüntüle</button><button class="g-delete" onclick="bgysInfografikDelete('${it.id}')">🗑️ İnfografikten Kaldır</button></div><div class="reorder-controls"><button class="reorder-btn" ${i===0?'disabled':''} onclick="bgysInfografikMove('${it.id}',-1)">⬆️</button><button class="reorder-btn" ${i===arr.length-1?'disabled':''} onclick="bgysInfografikMove('${it.id}',1)">⬇️</button><label class="order-label">Sıra <input type="number" min="1" max="${arr.length}" value="${i+1}" style="width:55px;padding:5px;border:1px solid var(--mist);border-radius:7px" onchange="bgysInfografikSetPosition('${it.id}',this.value)"></label></div></div></article>`).join('')}</div></section>`}).join('');
    }catch(e){console.error('İnfografik düzeltmesi:',e)}}
  window.bgysInfografikFixRender=render;
  function start(){if(typeof bgysGetAllByModul==='function')render()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
