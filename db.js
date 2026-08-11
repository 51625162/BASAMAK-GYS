/* Basamak GYS - Firebase veri katmanı + içerik listesi görünüm düzeni */
/*
  Veri katmanının çalışan sürümü değişmeden korunur: aşağıdaki immutable commit'ten yüklenir.
  Bu dosyaya yalnızca sayfa görünüm düzeltmesi eklenmiştir.
*/
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
    if (document.getElementById("bgysCompactContentListsStyle")) return;

    const style = document.createElement("style");
    style.id = "bgysCompactContentListsStyle";
    style.textContent = `
      /* İçerik Ekle: listeler uzayıp sayfayı kalabalıklaştırmasın.
         Yaklaşık iki kayıt görünür; devamı listenin kendi içinde kaydırılır. */
      #konuList,
      #soruList,
      #soruCevapList,
      #denemeList {
        max-height: 190px !important;
        overflow-y: auto !important;
        overflow-x: hidden !important;
        padding: 2px 7px 4px 0;
        overscroll-behavior: contain;
        scrollbar-width: thin;
        -webkit-overflow-scrolling: touch;
      }

      #konuList::-webkit-scrollbar,
      #soruList::-webkit-scrollbar,
      #soruCevapList::-webkit-scrollbar,
      #denemeList::-webkit-scrollbar {
        width: 7px;
      }

      #konuList .item-card,
      #soruList .item-card,
      #soruCevapList .item-card,
      #denemeList .item-card {
        margin-bottom: 8px;
      }
    `;
    document.head.appendChild(style);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", compactContentLists);
  } else {
    compactContentLists();
  }
})();
