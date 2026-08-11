/* Basamak GYS - Firebase veri katmanı + içerik listesi görünüm düzeni */
/* Veri katmanı immutable çalışan sürümden yüklenir; bu dosya ayrıca İçerik Ekle listelerini kompakt tutar. */
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
      `;
      document.head.appendChild(style);
    }
  }

  function startCompactWatcher() {
    compactContentLists();
    setTimeout(compactContentLists, 50);
    setTimeout(compactContentLists, 300);
    setTimeout(compactContentLists, 1000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startCompactWatcher);
  } else {
    startCompactWatcher();
  }
})();
