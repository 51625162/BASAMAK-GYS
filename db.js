/* Basamak GYS - Paylaşılan veri katmanı (IndexedDB)
   Kullanıcının kendi eklediği konu anlatımı, soru ve deneme sınavlarını saklar.
   Tüm sayfalarda aynı db.js dosyası kullanılmalıdır. */

const BGYS_DB_NAME = "BasamakGYSDB";
const BGYS_DB_VERSION = 1;

function bgysOpenDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(BGYS_DB_NAME, BGYS_DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("konular")) {
        db.createObjectStore("konular", { keyPath: "id", autoIncrement: true });
      }
      if (!db.objectStoreNames.contains("sorular")) {
        db.createObjectStore("sorular", { keyPath: "id", autoIncrement: true });
      }
      if (!db.objectStoreNames.contains("soruSetleri")) {
        db.createObjectStore("soruSetleri", { keyPath: "id", autoIncrement: true });
      }
      if (!db.objectStoreNames.contains("denemeler")) {
        db.createObjectStore("denemeler", { keyPath: "id", autoIncrement: true });
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

function bgysTx(storeName, mode) {
  return bgysOpenDB().then(db => db.transaction(storeName, mode).objectStore(storeName));
}

function bgysAdd(storeName, record) {
  return bgysTx(storeName, "readwrite").then(store => new Promise((resolve, reject) => {
    record.createdAt = record.createdAt || Date.now();
    const req = store.add(record);
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => reject(e.target.error);
  }));
}

function bgysGetAll(storeName) {
  return bgysTx(storeName, "readonly").then(store => new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => reject(e.target.error);
  }));
}

function bgysDelete(storeName, id) {
  return bgysTx(storeName, "readwrite").then(store => new Promise((resolve, reject) => {
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = (e) => reject(e.target.error);
  }));
}

function bgysFileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ---- Soru metni yapıştırma formatı ayrıştırıcı ----
Beklenen format (her soru boş satırla ayrılır):

Soru metni buraya yazılır
A) Seçenek 1
B) Seçenek 2
C) Seçenek 3
D) Seçenek 4
Cevap: B
Açıklama: (opsiyonel, tek satır)
*/
function bgysParseSoruMetni(text) {
  const blocks = text.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);
  const results = [];
  const errors = [];
  blocks.forEach((block, idx) => {
    const lines = block.split("\n").map(l => l.trim()).filter(Boolean);
    const optionLines = { A: null, B: null, C: null, D: null };
    let question = "";
    let correctLetter = null;
    let explanation = "";
    let questionLines = [];
    lines.forEach(line => {
      const optMatch = line.match(/^([A-D])[\)\.\:]\s*(.+)$/i);
      const cevapMatch = line.match(/^cevap\s*[:\-]\s*([A-D])/i);
      const acikMatch = line.match(/^a[çc]ıklama\s*[:\-]\s*(.+)$/i);
      if (cevapMatch) {
        correctLetter = cevapMatch[1].toUpperCase();
      } else if (acikMatch) {
        explanation = acikMatch[1].trim();
      } else if (optMatch) {
        optionLines[optMatch[1].toUpperCase()] = optMatch[2].trim();
      } else {
        questionLines.push(line);
      }
    });
    question = questionLines.join(" ").trim();
    const options = [optionLines.A, optionLines.B, optionLines.C, optionLines.D];
    if (!question || options.some(o => !o) || !correctLetter) {
      errors.push({ block: idx + 1, reason: "Eksik alan (soru/şık/cevap bulunamadı)", raw: block.slice(0, 80) });
      return;
    }
    results.push({
      question,
      options,
      correct: "ABCD".indexOf(correctLetter),
      explanation: explanation || "Açıklama eklenmedi."
    });
  });
  return { results, errors };
}
