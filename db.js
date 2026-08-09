/* Basamak GYS - Paylaşılan veri katmanı (Firebase: Authentication + Firestore)
   Her kullanıcı e-posta/şifre ile giriş yapar; verileri Firestore'da kendi
   hesabına özel olarak saklanır, hangi cihazdan girerse girsin görünür.
   Tüm sayfalarda aynı db.js dosyası kullanılmalıdır. */

/* ================= Firebase SDK yükleme ================= */
const BGYS_FIREBASE_SDK_VERSION = "10.7.1";
let bgysFirebaseReadyPromise = null;

function bgysLoadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Yüklenemedi: " + src));
    document.head.appendChild(s);
  });
}

async function bgysEnsureFirebaseSdk() {
  if (window.firebase && window.firebase.apps) return;
  const base = `https://www.gstatic.com/firebasejs/${BGYS_FIREBASE_SDK_VERSION}`;
  await bgysLoadScript(`${base}/firebase-app-compat.js`);
  await bgysLoadScript(`${base}/firebase-auth-compat.js`);
  await bgysLoadScript(`${base}/firebase-firestore-compat.js`);
}

/* ================= Firebase yapılandırması ================= */
const BGYS_FIREBASE_CONFIG_KEY = "bgys-firebase-config";

function bgysGetFirebaseConfig() {
  try {
    const raw = localStorage.getItem(BGYS_FIREBASE_CONFIG_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

function bgysSetFirebaseConfig(config) {
  localStorage.setItem(BGYS_FIREBASE_CONFIG_KEY, JSON.stringify(config));
}

function bgysClearFirebaseConfig() {
  localStorage.removeItem(BGYS_FIREBASE_CONFIG_KEY);
}

async function bgysInitFirebase() {
  if (bgysFirebaseReadyPromise) return bgysFirebaseReadyPromise;
  bgysFirebaseReadyPromise = (async () => {
    const config = bgysGetFirebaseConfig();
    if (!config) return null;
    await bgysEnsureFirebaseSdk();
    if (!firebase.apps.length) {
      firebase.initializeApp(config);
      try {
        await firebase.firestore().enablePersistence({ synchronizeTabs: true });
      } catch (e) {
        console.warn("Çevrimdışı önbellek etkinleştirilemedi:", e.message);
      }
    }
    return firebase.app();
  })();
  return bgysFirebaseReadyPromise;
}

/* ================= Kimlik doğrulama (Authentication) ================= */

async function bgysSignUp(email, password) {
  await bgysInitFirebase();
  const cred = await firebase.auth().createUserWithEmailAndPassword(email, password);
  return cred.user;
}

async function bgysLogIn(email, password) {
  await bgysInitFirebase();
  const cred = await firebase.auth().signInWithEmailAndPassword(email, password);
  return cred.user;
}

async function bgysLogOut() {
  await bgysInitFirebase();
  return firebase.auth().signOut();
}

async function bgysResetPassword(email) {
  await bgysInitFirebase();
  return firebase.auth().sendPasswordResetEmail(email);
}

async function bgysWaitForAuth() {
  const app = await bgysInitFirebase();
  if (!app) return null;
  return new Promise((resolve) => {
    const unsub = firebase.auth().onAuthStateChanged((user) => {
      unsub();
      resolve(user);
    });
  });
}

function bgysCurrentUser() {
  if (!window.firebase || !firebase.apps || !firebase.apps.length) return null;
  return firebase.auth().currentUser;
}

async function bgysRequireAuth() {
  const config = bgysGetFirebaseConfig();
  const path = location.pathname.split("/").pop();
  if (path === "auth.html") return null;
  if (!config) {
    location.href = "auth.html?returnTo=" + encodeURIComponent(location.pathname + location.search);
    return null;
  }
  const user = await bgysWaitForAuth();
  if (!user) {
    location.href = "auth.html?returnTo=" + encodeURIComponent(location.pathname + location.search);
    return null;
  }
  bgysInjectUserBadge(user);
  return user;
}

function bgysInjectUserBadge(user) {
  if (document.getElementById("bgysUserBadge")) return;
  const badge = document.createElement("div");
  badge.id = "bgysUserBadge";
  badge.style.cssText = "position:fixed;bottom:14px;right:14px;background:#10243E;color:white;padding:8px 14px;border-radius:100px;font-family:'Inter',sans-serif;font-size:0.75rem;display:flex;align-items:center;gap:10px;z-index:800;box-shadow:0 8px 20px -6px rgba(0,0,0,0.3);";
  badge.innerHTML = `<span>👤 ${user.email}</span><button id="bgysLogoutBtn" style="background:rgba(255,255,255,0.15);color:white;border:none;padding:5px 10px;border-radius:100px;font-size:0.72rem;cursor:pointer;">Çıkış</button>`;
  document.body.appendChild(badge);
  document.getElementById("bgysLogoutBtn").addEventListener("click", async () => {
    await bgysLogOut();
    location.href = "auth.html";
  });
}

/* ================= Firestore veri işlemleri (eski IndexedDB fonksiyonlarının yerine) ================= */
const BGYS_MAX_DOC_BYTES = 900000;

function bgysUserCollection(storeName) {
  const user = bgysCurrentUser();
  if (!user) throw new Error("Giriş yapılmamış");
  return firebase.firestore().collection("users").doc(user.uid).collection(storeName);
}

async function bgysAdd(storeName, record) {
  await bgysInitFirebase();
  record.createdAt = record.createdAt || Date.now();
  const boyut = new Blob([JSON.stringify(record)]).size;
  if (boyut > BGYS_MAX_DOC_BYTES) {
    throw new Error("Dosya çok büyük (bulut depolama limiti ~900KB). Daha küçük bir dosya dene.");
  }
  const ref = await bgysUserCollection(storeName).add(record);
  bgysScheduleCloudPush();
  return ref.id;
}

async function bgysGetAll(storeName) {
  await bgysInitFirebase();
  const user = bgysCurrentUser();
  if (!user) return [];
  const snap = await bgysUserCollection(storeName).get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(r => !r.deleted);
}

async function bgysGetAllByModul(storeName) {
  const all = await bgysGetAll(storeName);
  const modul = bgysCurrentModul();
  return all.filter(r => (r.modul || "saymanlik") === modul);
}

// Yumuşak silme: kayıt gerçekten silinmez, "deleted" işaretlenir — Silinenler'den geri alınabilir.
async function bgysDelete(storeName, id) {
  await bgysInitFirebase();
  await bgysUserCollection(storeName).doc(String(id)).update({ deleted: true, deletedAt: Date.now() });
}

// Silinenler (çöp kutusu) listesini getirir — mevcut bölüme göre filtrelenir.
async function bgysGetTrashByModul(storeName) {
  await bgysInitFirebase();
  const user = bgysCurrentUser();
  if (!user) return [];
  const snap = await bgysUserCollection(storeName).get();
  const modul = bgysCurrentModul();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .filter(r => r.deleted && (r.modul || "saymanlik") === modul);
}

// Silinenler'den geri yükler.
async function bgysRestoreFromTrash(storeName, id) {
  await bgysInitFirebase();
  await bgysUserCollection(storeName).doc(String(id)).update({ deleted: false, deletedAt: null });
}

// Kalıcı olarak siler (geri alınamaz).
async function bgysPermanentDelete(storeName, id) {
  await bgysInitFirebase();
  await bgysUserCollection(storeName).doc(String(id)).delete();
}

// Bir bölümdeki (mevcut modül) tüm kayıtları toplu olarak (yumuşak) siler.
async function bgysDeleteAllInStore(storeName) {
  const items = await bgysGetAllByModul(storeName);
  await bgysInitFirebase();
  const batch = firebase.firestore().batch();
  const col = bgysUserCollection(storeName);
  items.forEach(it => batch.update(col.doc(String(it.id)), { deleted: true, deletedAt: Date.now() }));
  await batch.commit();
  return items.length;
}

// Belirli bir tarih aralığındaki kayıtları toplu (yumuşak) siler. from/to: timestamp (ms).
async function bgysDeleteByDateRange(storeName, fromTs, toTs) {
  const items = await bgysGetAllByModul(storeName);
  const hedef = items.filter(it => it.createdAt >= fromTs && it.createdAt <= toTs);
  await bgysInitFirebase();
  const batch = firebase.firestore().batch();
  const col = bgysUserCollection(storeName);
  hedef.forEach(it => batch.update(col.doc(String(it.id)), { deleted: true, deletedAt: Date.now() }));
  await batch.commit();
  return hedef.length;
}

// Çöp kutusunu (mevcut bölüm için) tamamen boşaltır — geri alınamaz.
async function bgysEmptyTrash(storeName) {
  const items = await bgysGetTrashByModul(storeName);
  await bgysInitFirebase();
  const batch = firebase.firestore().batch();
  const col = bgysUserCollection(storeName);
  items.forEach(it => batch.delete(col.doc(String(it.id))));
  await batch.commit();
  return items.length;
}

async function bgysPutAll(storeName, records) {
  await bgysInitFirebase();
  const col = bgysUserCollection(storeName);
  for (const rec of records) {
    const { id, ...rest } = rec;
    if (id) await col.doc(String(id)).set(rest);
    else await col.add(rest);
  }
}

async function bgysClearStore(storeName) {
  await bgysInitFirebase();
  const snap = await bgysUserCollection(storeName).get();
  const batch = firebase.firestore().batch();
  snap.docs.forEach(d => batch.delete(d.ref));
  await batch.commit();
}

function bgysScheduleCloudPush() {}

/* ================= Bölümler arası kopyalama ================= */
async function bgysCopyToModul(storeName, id, targetModul) {
  const all = await bgysGetAll(storeName);
  const record = all.find(r => r.id === id);
  if (!record) throw new Error("Kayıt bulunamadı");
  const clone = { ...record };
  delete clone.id;
  if (storeName === "sorular") delete clone.denemeId;
  clone.modul = targetModul;
  clone.createdAt = Date.now();
  return bgysAdd(storeName, clone);
}

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

function bgysOtherModuller() {
  const current = bgysCurrentModul();
  return Object.keys(BGYS_MODULLER).filter(k => k !== current).map(k => ({ key: k, ...BGYS_MODULLER[k] }));
}

/* ================= Kullanıcılar arası paylaşım ================= */
async function bgysShareItem(storeName, id, toEmail) {
  await bgysInitFirebase();
  const user = bgysCurrentUser();
  if (!user) throw new Error("Giriş yapılmamış");
  const all = await bgysGetAll(storeName);
  const record = all.find(r => r.id === id);
  if (!record) throw new Error("Kayıt bulunamadı");
  const clone = { ...record };
  delete clone.id;
  await firebase.firestore().collection("shares").add({
    storeName,
    record: clone,
    baslikOzet: clone.baslik || clone.question || clone.soru || "İçerik",
    fromEmail: user.email,
    toEmail: toEmail.trim().toLowerCase(),
    sharedAt: Date.now(),
    status: "pending"
  });
}

// Bir bölümdeki (mevcut modül) belirli bir store'daki TÜM kayıtları paylaşır.
async function bgysShareAllInStore(storeName, toEmail) {
  const items = await bgysGetAllByModul(storeName);
  for (const it of items) await bgysShareItem(storeName, it.id, toEmail);
  return items.length;
}

// "bolum" (ders/konu) alanına göre filtrelenmiş kayıtları paylaşır.
async function bgysShareByBolum(storeName, bolum, toEmail) {
  const items = await bgysGetAllByModul(storeName);
  const hedef = items.filter(it => it.bolum === bolum);
  for (const it of hedef) await bgysShareItem(storeName, it.id, toEmail);
  return hedef.length;
}

// Mevcut bölümdeki (modül) TÜM içerik türlerini (konu/soru/soru-cevap/deneme) paylaşır.
async function bgysShareAllContent(toEmail) {
  let toplam = 0;
  for (const store of BGYS_SYNC_STORES) {
    toplam += await bgysShareAllInStore(store, toEmail);
  }
  return toplam;
}

// Gelen TÜM paylaşımları getirir (bekleyen/kabul edilen/reddedilen dahil) — kalıcı bildirim geçmişi.
async function bgysGetIncomingShares() {
  await bgysInitFirebase();
  const user = bgysCurrentUser();
  if (!user) return [];
  const snap = await firebase.firestore().collection("shares")
    .where("toEmail", "==", user.email.toLowerCase())
    .get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.sharedAt || 0) - (a.sharedAt || 0));
}

async function bgysAcceptShare(shareId) {
  await bgysInitFirebase();
  const doc = await firebase.firestore().collection("shares").doc(shareId).get();
  if (!doc.exists) throw new Error("Paylaşım bulunamadı");
  const share = doc.data();
  const clone = { ...share.record, modul: bgysCurrentModul(), createdAt: Date.now() };
  delete clone.denemeId;
  await bgysAdd(share.storeName, clone);
  await firebase.firestore().collection("shares").doc(shareId).update({ status: "accepted" });
}

async function bgysDeclineShare(shareId) {
  await bgysInitFirebase();
  await firebase.firestore().collection("shares").doc(shareId).update({ status: "declined" });
}

// Bildirimi (kabul/red durumundan bağımsız) kalıcı olarak siler.
async function bgysDeleteShareNotification(shareId) {
  await bgysInitFirebase();
  await firebase.firestore().collection("shares").doc(shareId).delete();
}

/* ================= Bölüm (modül) sistemi ================= */
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

function bgysWithModul(url) {
  const modul = bgysCurrentModul();
  return url + (url.includes("?") ? "&" : "?") + "modul=" + encodeURIComponent(modul);
}

function bgysFileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ---- Soru metni yapıştırma formatı ayrıştırıcı ---- */
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

function bgysParseSoruMetniFlexible(text, requireAnswer) {
  text = bgysAutoInsertBlockBreaks(text);
  const blocks = text.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);
  const results = [];
  const uyarilar = [];
  blocks.forEach((block, idx) => {
    const lines = block.split("\n").map(l => l.trim()).filter(Boolean);
    const optionLines = { A: null, B: null, C: null, D: null };
    let correctLetter = null;
    let explanation = "";
    let questionLines = [];
    lines.forEach(line => {
      const optMatch = line.match(/^([A-D])\s*[\)\.\:\-]\s*(.+)$/i);
      const cevapMatch = line.match(/^(do[ğg]ru\s+)?(cevap|yan[ıi]t)\s*[:\-]\s*([A-D])\b/i);
      const acikMatch = line.match(/^(a[çc][ıi]klama|[çc]öz[üu]m|cozum)\s*[:\-]\s*(.+)$/i);
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
    const question = questionLines.join(" ").trim().replace(/^\d+\s*[\.\)\-]\s*/, "") || "(Soru metni girilmedi)";
    const eksikSik = ["A","B","C","D"].filter(l => !optionLines[l]);
    if (eksikSik.length > 0) {
      uyarilar.push({ block: idx + 1, not: `${eksikSik.join(", ")} şıkkı boş bırakıldı` });
    }
    const options = ["A","B","C","D"].map(l => optionLines[l] || "(Boş bırakıldı)");
    let correct;
    if (correctLetter) {
      correct = "ABCD".indexOf(correctLetter);
    } else if (requireAnswer) {
      correct = 0;
      uyarilar.push({ block: idx + 1, not: "Cevap belirtilmemiş, A varsayıldı" });
    } else {
      correct = null;
    }
    results.push({ question, options, correct, explanation: explanation || "Açıklama eklenmedi." });
  });
  return { results, errors: uyarilar };
}

function bgysParseSoruMetni(text) {
  return bgysParseSoruMetniFlexible(text, true);
}

/* ---- Cevap anahtarı ayrıştırıcı ---- */
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
    const result = [];
    for (let i = 0; i < numberedLetters.length; i++) result.push(numberedLetters[i] || null);
    return result;
  }
  const matches = text.toUpperCase().match(/\b[A-D]\b/g);
  return matches ? matches : [];
}

/* ---- PDF'ten metin çıkarma ---- */
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

/* ---- Soru-Cevap (flashcard) ayrıştırıcı ----
Format: her blok bir çift, boş satırla ayrılır.
Soru: ... satırı (ya da etiketsiz ilk satır/satırlar) + Cevap: ... satırı */
function bgysParseSoruCevap(text) {
  const blocks = text.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);
  const results = [];
  blocks.forEach(block => {
    const lines = block.split("\n").map(l => l.trim()).filter(Boolean);
    let soru = "", cevap = "";
    let mode = "soru";
    lines.forEach(line => {
      const cevapMatch = line.match(/^(cevap|yan[ıi]t)\s*[:\-]\s*(.+)$/i);
      const soruMatch = line.match(/^soru\s*[:\-]\s*(.+)$/i);
      if (cevapMatch) {
        cevap = (cevap ? cevap + " " : "") + cevapMatch[2].trim();
        mode = "cevap";
      } else if (soruMatch) {
        soru = (soru ? soru + " " : "") + soruMatch[1].trim();
        mode = "soru";
      } else if (mode === "cevap") {
        cevap += (cevap ? " " : "") + line;
      } else {
        soru += (soru ? " " : "") + line;
      }
    });
    if (soru) results.push({ soru, cevap: cevap || "(Cevap girilmedi)" });
  });
  return results;
}

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

/* ================= Yedekleme (JSON dışa/içe aktar) ================= */
const BGYS_SYNC_STORES = ["konular", "sorular", "soruSetleri", "denemeler", "soruCevap", "hatirlatmalar", "dersTakip"];

/* ================= Hatırlatmalar (bölümden bağımsız, hesaba özel) ================= */
// Zamanı gelmiş (tarih+saat şimdiden önce/eşit) ve henüz tamamlanmamış hatırlatmaları döner.
async function bgysGetDueReminders() {
  const all = await bgysGetAll('hatirlatmalar');
  const now = Date.now();
  return all.filter(r => !r.tamamlandi && r.zamanTs && r.zamanTs <= now)
    .sort((a, b) => b.zamanTs - a.zamanTs);
}

async function bgysMarkReminderDone(id) {
  await bgysInitFirebase();
  await bgysUserCollection('hatirlatmalar').doc(String(id)).update({ tamamlandi: true, tamamlandiAt: Date.now() });
}


async function bgysExportAllData() {
  const data = { exportedAt: Date.now(), version: 2 };
  for (const store of BGYS_SYNC_STORES) {
    data[store] = await bgysGetAll(store);
  }
  return data;
}

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

/* ================= Çözülen Soru Takibi (cihaz bazlı, localStorage) ================= */
function bgysSolvedKey() {
  return "bgys-solved-" + bgysCurrentModul();
}

function bgysGetSolvedMap() {
  try {
    const raw = localStorage.getItem(bgysSolvedKey());
    return raw ? JSON.parse(raw) : {};
  } catch (e) { return {}; }
}

function bgysMarkSolved(questionId, wasCorrect) {
  const map = bgysGetSolvedMap();
  map[questionId] = { correct: !!wasCorrect, solvedAt: Date.now() };
  localStorage.setItem(bgysSolvedKey(), JSON.stringify(map));
}

function bgysIsSolved(questionId) {
  const map = bgysGetSolvedMap();
  return !!map[questionId];
}

function bgysClearSolved() {
  localStorage.removeItem(bgysSolvedKey());
}
