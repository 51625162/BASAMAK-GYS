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

requireAnswer=false verilirse "Cevap:" satırı olmadan da soru+4 şık yeterli sayılır
(correct alanı null döner) — PDF'ten çıkarılan, cevabı ayrı bir anahtarla eşleştirilecek
sorular için kullanılır.
*/
function bgysParseSoruMetniFlexible(text, requireAnswer) {
  if (requireAnswer === undefined) requireAnswer = true;
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
