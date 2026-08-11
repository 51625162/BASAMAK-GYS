/* Basamak GYS - Firebase veri katmanı + içerik listesi görünüm düzeni + grup paylaşımı */
/* Veri katmanı immutable çalışan sürümden yüklenir; bu dosyaya yalnızca görünüm ve toplu paylaşım yardımcıları eklenir. */
(function () {
  const STABLE_DB_URL = "https://raw.githubusercontent.com/51625162/BASAMAK-GYS/8c287acabae45160ad0e4edc56c0ebe01164202f/db.js";

  const xhr = new XMLHttpRequest();
  xhr.open("GET", STABLE_DB_URL, false);
  xhr.send(null);
  if (xhr.status >= 200 && xhr.status < 300 && xhr.responseText) {
    const script = document.createElement("script");
    script.textContent = xhr.responseText;
    document.head.appendChild(script);
  } else {
    throw new Error("Basamak GYS veri katmanı yüklenemedi.");
  }

  function compactContentLists() {
    if (!location.pathname.endsWith("/icerik-ekle.html") && !location.pathname.endsWith("icerik-ekle.html")) return;

    if (!document.getElementById("bgysCompactContentListsStyle")) {
      const style = document.createElement("style");
      style.id = "bgysCompactContentListsStyle";
      style.textContent = `
        /* İçerik Ekle listeleri: yalnızca yaklaşık 2 kayıt yüksekliğinde.
           3. ve sonraki kayıtlar sayfanın değil, listenin kendi içinde kayar. */
        #konuList,
        #soruList,
        #soruSetiList,
        #soruCevapList,
        #denemeList {
          display: block !important;
          height: 190px !important;
          max-height: 190px !important;
          min-height: 0 !important;
          overflow-y: scroll !important;
          overflow-x: hidden !important;
          padding: 2px 8px 4px 0 !important;
          margin: 0 !important;
          overscroll-behavior: contain;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: auto;
        }
        #konuList::-webkit-scrollbar,
        #soruList::-webkit-scrollbar,
        #soruSetiList::-webkit-scrollbar,
        #soruCevapList::-webkit-scrollbar,
        #denemeList::-webkit-scrollbar { width: 8px; }
        #konuList .item-card,
        #soruList .item-card,
        #soruSetiList .item-card,
        #soruCevapList .item-card,
        #denemeList .item-card {
          margin-bottom: 8px !important;
          flex-shrink: 0 !important;
        }

        /* 5275 gibi bir konu/ders grubunu tek seferde paylaşma kartı */
        #bgysGroupShareCard {
          border: 1px solid var(--mist);
          background: var(--white);
          border-radius: var(--radius-lg);
          padding: 20px;
          margin: 0 0 22px;
        }
        #bgysGroupShareCard h3 { margin:0 0 5px; font-family:'Sora',system-ui,sans-serif; font-size:1.05rem; }
        #bgysGroupShareCard .bgys-group-help { margin:0 0 14px; color:var(--slate); font-size:.82rem; line-height:1.5; }
        #bgysGroupShareCard .bgys-group-grid { display:grid; grid-template-columns:1fr; gap:10px; }
        #bgysGroupShareCard input[type=text] {
          width:100%; padding:11px 14px; border-radius:12px; border:1.5px solid var(--mist);
          font-size:.9rem; background:var(--cloud); color:var(--ink); box-sizing:border-box;
        }
        #bgysGroupShareCard .bgys-group-checks { display:flex; gap:8px; flex-wrap:wrap; }
        #bgysGroupShareCard .bgys-group-check {
          display:flex; align-items:center; gap:7px; padding:8px 11px; border:1.5px solid var(--mist);
          border-radius:100px; background:var(--white); font-size:.8rem; font-weight:700; color:var(--ink);
        }
        #bgysGroupShareCard .bgys-group-check input { width:16px; height:16px; margin:0; }
        #bgysGroupShareCard .bgys-group-actions { display:flex; gap:8px; flex-wrap:wrap; margin-top:2px; }
        #bgysGroupShareCard .bgys-group-actions button {
          padding:10px 16px; border-radius:100px; border:none; font-weight:700; font-size:.82rem; cursor:pointer;
        }
        #bgysGroupShareCard .bgys-group-send { background:linear-gradient(135deg,var(--teal),var(--teal-dark)); color:#fff; }
        #bgysGroupShareCard .bgys-group-clear { background:var(--cloud); color:var(--ink); border:1.5px solid var(--mist) !important; }
        #bgysGroupShareCard .bgys-group-result { margin-top:10px; padding:10px 12px; border-radius:10px; font-size:.8rem; display:none; }
        #bgysGroupShareCard .bgys-group-result.ok { display:block; background:rgba(34,197,94,.1); color:#16803C; }
        #bgysGroupShareCard .bgys-group-result.warn { display:block; background:rgba(245,166,35,.12); color:#B0740F; }
        #bgysGroupShareCard .bgys-group-result.err { display:block; background:rgba(239,68,68,.1); color:#C0392B; }
      `;
      document.head.appendChild(style);
    }
  }

  function normalizeGroupValue(value) {
    return String(value || "").trim().replace(/\\s+/g, " ").toLocaleLowerCase("tr-TR");
  }

  /* Grup paylaşımı: örneğin "5275" yazıldığında o bölüme ait tüm konu ve/veya
     sorular tek işlemle seçilen kullanıcıya gönderilir. */
  window.bgysShareContentGroup = async function (groupName, toEmail, stores) {
    const group = normalizeGroupValue(groupName);
    const email = String(toEmail || "").trim().toLowerCase();
    if (!group) throw new Error("Grup adı gerekli.");
    if (!email) throw new Error("E-posta gerekli.");
    if (!Array.isArray(stores) || stores.length === 0) throw new Error("En az bir içerik türü seç.");

    let toplam = 0;
    const sayilar = {};
    for (const store of stores) {
      const items = await bgysGetAllByModul(store);
      const hedef = items.filter(it => normalizeGroupValue(it.bolum) === group);
      sayilar[store] = hedef.length;
      for (const it of hedef) {
        await bgysShareItem(store, it.id, email);
        toplam++;
      }
    }
    return { toplam, sayilar };
  };

  function groupShareStoreLabels(stores) {
    const map = {
      konular: "Konu",
      sorular: "Soru",
      soruCevap: "Soru-Cevap",
      soruSetleri: "Soru Seti",
      denemeler: "Deneme"
    };
    return stores.map(s => map[s] || s).join(" + ");
  }

  function injectGroupShareCard() {
    if (!location.pathname.endsWith("/icerik-ekle.html") && !location.pathname.endsWith("icerik-ekle.html")) return;
    if (document.getElementById("bgysGroupShareCard")) return;

    const anchor = document.querySelector(".tabs");
    if (!anchor || !anchor.parentNode) return;

    const card = document.createElement("div");
    card.id = "bgysGroupShareCard";
    card.innerHTML = `
      <h3>📤 5275 gibi tüm konuları / soruları paylaş</h3>
      <p class="bgys-group-help">Bir grup adı yaz. Örneğin <b>5275</b>. O gruba ait içeriklerin tamamını tek seferde başka bir kullanıcıya gönder.</p>
      <div class="bgys-group-grid">
        <input id="bgysGroupShareName" type="text" placeholder="Grup / Bölüm adı (Örn. 5275 SAYILI KANUN)">
        <input id="bgysGroupShareEmail" type="text" placeholder="Gönderilecek kullanıcı e-postası">
        <div class="bgys-group-checks">
          <label class="bgys-group-check"><input type="checkbox" id="bgysGroupShareKonular" checked> 📘 Tüm Konular</label>
          <label class="bgys-group-check"><input type="checkbox" id="bgysGroupShareSorular" checked> ❓ Tüm Sorular</label>
          <label class="bgys-group-check"><input type="checkbox" id="bgysGroupShareSoruCevap"> 📇 Soru-Cevap</label>
          <label class="bgys-group-check"><input type="checkbox" id="bgysGroupShareDenemeler"> 📝 Denemeler</label>
        </div>
        <div class="bgys-group-actions">
          <button type="button" class="bgys-group-send" id="bgysGroupShareSend">📤 Grubu Paylaş</button>
          <button type="button" class="bgys-group-clear" id="bgysGroupShareClear">Temizle</button>
        </div>
        <div id="bgysGroupShareResult" class="bgys-group-result"></div>
      </div>
    `;
    anchor.parentNode.insertBefore(card, anchor.nextSibling);

    const result = document.getElementById("bgysGroupShareResult");
    const showResult = (kind, text) => {
      result.className = "bgys-group-result " + kind;
      result.textContent = text;
    };

    document.getElementById("bgysGroupShareClear").addEventListener("click", () => {
      document.getElementById("bgysGroupShareName").value = "";
      document.getElementById("bgysGroupShareEmail").value = "";
      result.className = "bgys-group-result";
      result.textContent = "";
    });

    document.getElementById("bgysGroupShareSend").addEventListener("click", async () => {
      const group = document.getElementById("bgysGroupShareName").value.trim();
      const email = document.getElementById("bgysGroupShareEmail").value.trim();
      const stores = [];
      if (document.getElementById("bgysGroupShareKonular").checked) stores.push("konular");
      if (document.getElementById("bgysGroupShareSorular").checked) stores.push("sorular");
      if (document.getElementById("bgysGroupShareSoruCevap").checked) stores.push("soruCevap");
      if (document.getElementById("bgysGroupShareDenemeler").checked) stores.push("denemeler");

      if (!group) return showResult("err", "Grup adı gerekli. Örn. 5275");
      if (!email) return showResult("err", "Gönderilecek kullanıcı e-postası gerekli.");
      if (stores.length === 0) return showResult("err", "En az bir içerik türü seç.");

      const btn = document.getElementById("bgysGroupShareSend");
      btn.disabled = true;
      btn.style.opacity = ".65";
      showResult("warn", "Paylaşılıyor... Lütfen bekle.");
      try {
        const sonuc = await window.bgysShareContentGroup(group, email, stores);
        if (sonuc.toplam === 0) {
          showResult("err", `"${group}" grubunda seçtiğin içerik türlerinde kayıt bulunamadı.`);
        } else {
          showResult("ok", `${sonuc.toplam} içerik ${email} adresine gönderildi (${groupShareStoreLabels(stores)}).`);
        }
      } catch (e) {
        showResult("err", "Hata: " + (e.message || e));
      } finally {
        btn.disabled = false;
        btn.style.opacity = "1";
      }
    });
  }

  function startCompactWatcher() {
    compactContentLists();
    injectGroupShareCard();
    setTimeout(compactContentLists, 50);
    setTimeout(injectGroupShareCard, 50);
    setTimeout(compactContentLists, 300);
    setTimeout(injectGroupShareCard, 300);
    setTimeout(compactContentLists, 1000);
    setTimeout(injectGroupShareCard, 1000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startCompactWatcher);
  } else {
    startCompactWatcher();
  }
})();
