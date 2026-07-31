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
    req.onsuccess = () => { bgysScheduleCloudPush(); resolve(req.result); };
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
    req.onsuccess = () => { bgysScheduleCloudPush(); resolve(); };
    req.onerror = (e) => reject(e.target.error);
  }));
}

// Buluttan geri yükleme sırasında orijinal id'leri korumak için put kullanır (add değil).
function bgysPutAll(storeName, records) {
  return bgysTx(storeName, "readwrite").then(store => new Promise((resolve, reject) => {
    let remaining = records.length;
    if (remaining === 0) return resolve();
    records.forEach(rec => {
      const req = store.put(rec);
      req.onsuccess = () => { remaining--; if (remaining === 0) resolve(); };
      req.onerror = (e) => reject(e.target.error);
    });
  }));
}

function bgysClearStore(storeName) {
  return bgysTx(storeName, "readwrite").then(store => new Promise((resolve, reject) => {
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = (e) => reject(e.target.error);
  }));
}

/* ---- Bölüm (modül) sistemi ----
   Basamak GYS birden fazla bağımsız bölümden oluşur (Saymanlık, DS Şefliği, ...).
   Her sayfa URL'sindeki ?modul=... parametresine göre hangi bölümün verisiyle
   çalıştığını bilir. Parametre yoksa geriye dönük uyumluluk için "saymanlik" varsayılır. */
const BGYS_MODULLER = {
  "saymanlik": { ad: "Saymanlık", sayfa: "saymanlik.html" },
  "ds-sefligi": { ad: "DS Şefliği", sayfa: "ds-sefligi.html" },
  "idare-memuru": { ad: "İdare Memuru", sayfa: "idare-memuru.html" }
};

function bgysCurrentModul() {
  return new URLSearchParams(location.search).get("modul") || "saymanlik";
}

function bgysModulInfo() {
  const key = bgysCurrentModul();
  return { key, ...(BGYS_MODULLER[key] || { ad: key, sayfa: "index.html" }) };
}

// Sayfa içi linklere (icerik-ekle.html, soru-coz.html vb.) mevcut modul parametresini ekler.
function bgysWithModul(url) {
  const modul = bgysCurrentModul();
  return url + (url.includes("?") ? "&" : "?") + "modul=" + encodeURIComponent(modul);
}

// Kayıtları (konular/sorular/soruSetleri/denemeler) sadece mevcut bölüme ait olanlarla filtreler.
// modul alanı olmayan eski kayıtlar geriye dönük uyumluluk için "saymanlik" sayılır.
async function bgysGetAllByModul(storeName) {
  const all = await bgysGetAll(storeName);
  const modul = bgysCurrentModul();
  return all.filter(r => (r.modul || "saymanlik") === modul);
}

// Bir kaydı (konu/soru/soruSeti/deneme) başka bir bölüme kopyalar. Denemeye ait sorular
// (denemeId) taşınmaz, sadece bağımsız kayıtlar aktarılır.
async function bgysCopyToModul(storeName, id, targetModul) {
  const all = await bgysGetAll(storeName);
  const record = all.find(r => r.id === id);
  if (!record) throw new Error("Kayıt bulunamadı");
  const clone = { ...record };
  delete clone.id;
  if (storeName === "sorular") delete clone.denemeId; // deneme bağlantısı hedef bölümde anlamsız, bağımsız soru olarak aktarılır
  clone.modul = targetModul;
  clone.createdAt = Date.now();
  return bgysAdd(storeName, clone);
}

function bgysOtherModuller() {
  const current = bgysCurrentModul();
  return Object.keys(BGYS_MODULLER).filter(k => k !== current).map(k => ({ key: k, ...BGYS_MODULLER[k] }));
}

// Bir denemeyi (metin tipi) bağlı tüm sorularıyla birlikte başka bölüme kopyalar.
async function bgysCopyDenemeToModul(denemeId, targetModul) {
  const denemeler = await bgysGetAll("denemeler");
  const deneme = denemeler.find(d => d.id === denemeId);
  if (!deneme) throw new Error("Deneme bulunamadı");
  const denemeClone = { ...deneme };
  delete denemeClone.id;
  denemeClone.modul = targetModul;
  denemeClone.createdAt = Date.now();
  const newDenemeId = await bgysAdd("denemeler", denemeClone);

  if (deneme.tip === "metin") {
    const tumSorular = await bgysGetAll("sorular");
    const denemeSorulari = tumSorular.filter(s => s.denemeId === denemeId);
    for (const s of denemeSorulari) {
      const soruClone = { ...s };
      delete soruClone.id;
      soruClone.modul = targetModul;
      soruClone.denemeId = newDenemeId;
      soruClone.createdAt = Date.now();
      await bgysAdd("sorular", soruClone);
    }
  }
  return newDenemeId;
}

function bgysFileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* Boş satırla ayrılmamış, numaralı soru listelerini (1. ... 2. ... gibi) otomatik olarak
   bloklara ayırır — kullanıcı her sorudan sonra boş satır bırakmayı unutsa bile çalışır. */
function bgysAutoInsertBlockBreaks(text) {
  const lines = text.split("\n");
  const out = [];
  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    const isNewQuestion = /^\d+\s*[\.\)\-]\s*\S/.test(trimmed);
    if (isNewQuestion && idx !== 0 && out.length > 0 && out[out.length - 1].trim() !== "") {
      out.push("");
    }
    out.push(line);
  });
  return out.join("\n");
}

/* ---- Soru metni yapıştırma formatı ayrıştırıcı ----
Beklenen format (her soru tercihen boş satırla ayrılır, ama numaralıysa boş satır şart değil):

Soru metni buraya yazılır
A) Seçenek 1
B) Seçenek 2
C) Seçenek 3
D) Seçenek 4
Cevap: B
Açıklama: (opsiyonel, tek satır)

Esneklikler: şık işareti olarak ) . : - hepsi kabul edilir (A) A. A: A- gibi), küçük harf de
olur. "Cevap:" yerine "Doğru Cevap:", "Yanıt:", "Doğru Yanıt:" de kabul edilir. "Açıklama:"
yerine "Çözüm:" de kabul edilir. Numaralı sorularda (1. 2. 3. ...) aralarında boş satır
olmasa da otomatik olarak ayrılır.

requireAnswer=false verilirse "Cevap:" satırı olmadan da soru+4 şık yeterli sayılır
(correct alanı null döner) — PDF'ten çıkarılan, cevabı ayrı bir anahtarla eşleştirilecek
sorular için kullanılır.
*/
function bgysParseSoruMetniFlexible(text, requireAnswer) {
  if (requireAnswer === undefined) requireAnswer = true;
  text = bgysAutoInsertBlockBreaks(text);
  const blocks = text.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);
  const results = [];
  const errors = [];
  blocks.forEach((block, idx) => {
    const lines = block.split("\n").map(l => l.trim()).filter(Boolean);
    const optionLines = { A: null, B: null, C: null, D: null };
    let correctLetter = null;
    let explanation = "";
    let questionLines = [];
    lines.forEach(line => {
      const optMatch = line.match(/^([A-D])\s*[\)\.\:\-]\s*(.+)$/i);
      const cevapMatch = line.match(/^(do[ğg]ru\s+)?(cevap|yan[ıi]t)\s*[:\-]\s*([A-D])\b/i);
      const acikMatch = line.match(/^(a[çc]ıklama|[çc]özüm|cozum)\s*[:\-]\s*(.+)$/i);
      if (cevapMatch) {
        correctLetter = cevapMatch[3].toUpperCase();
      } else if (acikMatch) {
        explanation = acikMatch[2].trim();
      } else if (optMatch) {
        optionLines[optMatch[1].toUpperCase()] = optMatch[2].trim();
      } else {
        questionLines.push(line);
      }
    });
    const question = questionLines.join(" ").trim().replace(/^\d+\s*[\.\)\-]\s*/, "");
    const options = [optionLines.A, optionLines.B, optionLines.C, optionLines.D];
    if (!question || options.some(o => !o) || (requireAnswer && !correctLetter)) {
      errors.push({ block: idx + 1, reason: "Eksik alan (soru/şık" + (requireAnswer ? "/cevap" : "") + " bulunamadı)", raw: block.slice(0, 80) });
      return;
    }
    results.push({
      question,
      options,
      correct: correctLetter ? "ABCD".indexOf(correctLetter) : null,
      explanation: explanation || "Açıklama eklenmedi."
    });
  });
  return { results, errors };
}

// Geriye dönük uyumluluk: eskiden beri kullanılan isim, cevabı zorunlu tutar.
function bgysParseSoruMetni(text) {
  return bgysParseSoruMetniFlexible(text, true);
}

/* ---- Cevap anahtarı ayrıştırıcı ----
Kabul edilen biçimler:
  1. B          1) B         1- B        1: B
  1.B
  ya da numarasız, art arda harfler: "B D A C B ..." veya "BDACB..."
Dönüş: ["B","D","A",...] (sıra ile) */
function bgysParseCevapAnahtari(text) {
  if (!text || !text.trim()) return [];
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  const numberedLetters = [];
  let allNumbered = true;
  lines.forEach(line => {
    const m = line.match(/^(\d+)[\.\)\:\-]?\s*([A-D])\b/i);
    if (m) {
      numberedLetters[parseInt(m[1], 10) - 1] = m[2].toUpperCase();
    } else {
      allNumbered = false;
    }
  });
  if (allNumbered && numberedLetters.length > 0) {
    // boşlukları da doldur (atlanan numara varsa null bırak)
    const result = [];
    for (let i = 0; i < numberedLetters.length; i++) result.push(numberedLetters[i] || null);
    return result;
  }
  // Numaralı değilse: metindeki tüm tekil A-D harflerini sırayla topla
  const matches = text.toUpperCase().match(/\b[A-D]\b/g);
  return matches ? matches : [];
}

/* ---- PDF'ten metin çıkarma (PDF.js gerektirir, sayfa dahil çağıran sayfada yüklenmeli) ----
   Metin öğelerini dikey konumlarına (y) göre satırlara ayırır (PDF.js tek tek kelime/parça
   döndürür, satır bilgisini korumaz). Ayrıca "1." "2)" gibi soru numarası ile başlayan
   satırların önüne boş satır ekleyerek soru bloklarını ayırır (parser bunlarla çalışır). */
async function bgysExtractPdfText(dataUrl) {
  if (typeof pdfjsLib === "undefined") throw new Error("PDF.js yüklenemedi");
  const base64 = dataUrl.split(",")[1];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
  const allLines = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    let currentLine = "";
    let lastY = null;
    content.items.forEach(item => {
      const y = item.transform ? item.transform[5] : null;
      if (lastY !== null && y !== null && Math.abs(y - lastY) > 2) {
        if (currentLine.trim()) allLines.push(currentLine.trim());
        currentLine = "";
      }
      currentLine += item.str + " ";
      lastY = y;
    });
    if (currentLine.trim()) allLines.push(currentLine.trim());
  }
  const withBreaks = [];
  allLines.forEach((line, idx) => {
    const isNewQuestion = /^\d+\s*[\.\)\-]\s*\S/.test(line);
    if (isNewQuestion && idx !== 0) withBreaks.push("");
    withBreaks.push(line);
  });
  return withBreaks.join("\n");
}

/* PDF'ten çıkarılan soruları (cevapsız olabilir) bir cevap anahtarıyla eşleştirir.
   Dönüş: { results: [...], eksikCevapSayisi } */
function bgysMergeCevapAnahtari(parsedResults, cevapListesi) {
  let eksikCevapSayisi = 0;
  const merged = parsedResults.map((r, i) => {
    if (r.correct !== null && r.correct !== undefined) return r;
    const letter = cevapListesi[i];
    if (letter && "ABCD".includes(letter)) {
      return { ...r, correct: "ABCD".indexOf(letter) };
    }
    eksikCevapSayisi++;
    return { ...r, correct: null };
  });
  return { results: merged, eksikCevapSayisi };
}

/* ================= Yedekleme ve Bulut Senkron ================= */

const BGYS_SYNC_STORES = ["konular", "sorular", "soruSetleri", "denemeler"];

// Tüm bölümlerdeki (modüllerdeki) tüm verileri tek bir JSON nesnesi olarak dışa aktarır.
async function bgysExportAllData() {
  const data = { exportedAt: Date.now(), version: 1 };
  for (const store of BGYS_SYNC_STORES) {
    data[store] = await bgysGetAll(store);
  }
  return data;
}

// Dışa aktarılan veriyi geri yükler. mode "replace" ise önce mevcut store temizlenir.
async function bgysImportAllData(data, mode) {
  mode = mode || "replace";
  for (const store of BGYS_SYNC_STORES) {
    const records = Array.isArray(data[store]) ? data[store] : [];
    if (mode === "replace") await bgysClearStore(store);
    await bgysPutAll(store, records);
  }
}

function bgysDownloadBackupFile() {
  return bgysExportAllData().then(data => {
    const blob = new Blob([JSON.stringify(data, null, 1)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const tarih = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `basamak-gys-yedek-${tarih}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  });
}

function bgysRestoreFromFile(file) {
  return file.text().then(text => {
    const data = JSON.parse(text);
    return bgysImportAllData(data, "replace");
  });
}

/* ---- JSONBin.io bulut senkron ----
   Ayarlar (API key + Bin ID) localStorage'da saklanır (cihaza özgü, tüm bölümler ortak). */
const BGYS_SYNC_CONFIG_KEY = "bgys-cloud-sync-config";
const JSONBIN_BASE = "https://api.jsonbin.io/v3/b";

function bgysGetSyncConfig() {
  try {
    const raw = localStorage.getItem(BGYS_SYNC_CONFIG_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

function bgysSetSyncConfig(apiKey, binId) {
  localStorage.setItem(BGYS_SYNC_CONFIG_KEY, JSON.stringify({ apiKey, binId }));
}

function bgysClearSyncConfig() {
  localStorage.removeItem(BGYS_SYNC_CONFIG_KEY);
}

// Yeni bir JSONBin "bin" oluşturur (mevcut yerel veriyle doldurur) ve Bin ID döner.
async function bgysCreateBin(apiKey) {
  const data = await bgysExportAllData();
  const resp = await fetch(JSONBIN_BASE, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Master-Key": apiKey,
      "X-Bin-Name": "BasamakGYS"
    },
    body: JSON.stringify(data)
  });
  if (!resp.ok) throw new Error("Bin oluşturulamadı (HTTP " + resp.status + ")");
  const json = await resp.json();
  return json.metadata.id;
}

async function bgysPushToCloud() {
  const cfg = bgysGetSyncConfig();
  if (!cfg || !cfg.apiKey || !cfg.binId) throw new Error("Bulut senkron ayarlanmamış");
  const data = await bgysExportAllData();
  const resp = await fetch(`${JSONBIN_BASE}/${cfg.binId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Master-Key": cfg.apiKey
    },
    body: JSON.stringify(data)
  });
  if (!resp.ok) throw new Error("Buluta gönderilemedi (HTTP " + resp.status + ")");
  localStorage.setItem("bgys-last-sync", Date.now().toString());
  return true;
}

async function bgysPullFromCloud() {
  const cfg = bgysGetSyncConfig();
  if (!cfg || !cfg.apiKey || !cfg.binId) throw new Error("Bulut senkron ayarlanmamış");
  const resp = await fetch(`${JSONBIN_BASE}/${cfg.binId}/latest`, {
    method: "GET",
    headers: { "X-Master-Key": cfg.apiKey }
  });
  if (!resp.ok) throw new Error("Buluttan yüklenemedi (HTTP " + resp.status + ")");
  const json = await resp.json();
  const data = json.record || json;
  await bgysImportAllData(data, "replace");
  localStorage.setItem("bgys-last-sync", Date.now().toString());
  return true;
}

// bgysAdd/bgysDelete her çağrıldığında otomatik tetiklenir (debounce'lu, ayar yoksa hiçbir şey yapmaz).
let bgysPushTimer = null;
function bgysScheduleCloudPush() {
  const cfg = bgysGetSyncConfig();
  if (!cfg || !cfg.apiKey || !cfg.binId) return;
  clearTimeout(bgysPushTimer);
  bgysPushTimer = setTimeout(() => {
    bgysPushToCloud().catch(e => console.warn("Bulut gönderim hatası:", e.message));
  }, 1500);
}

// Sayfa yüklenirken bir kere çağrılır: ayar varsa buluttan en güncel veriyi indirir.
async function bgysAutoPullIfConfigured() {
  const cfg = bgysGetSyncConfig();
  if (!cfg || !cfg.apiKey || !cfg.binId) return false;
  try {
    await bgysPullFromCloud();
    return true;
  } catch (e) {
    console.warn("Otomatik senkron hatası:", e.message);
    return false;
  }
}
