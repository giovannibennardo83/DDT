const DDT_STORAGE_KEY = 'ddtRecords';
const BACKUP_URL = 'https://script.google.com/macros/s/AKfycbzbF4v2-01P9AvsUWPhJFrdow5mPljOCiZYpZr_KrPIcB1qZmtzP53mTiFvI_ucw8g/exec';
const COUNTER_DB_NAME = 'ddt-db';
const COUNTER_DB_VERSION = 1;
const COUNTER_STORE = 'counters';
const BACKUP_PENDING_KEY = 'ddtBackupPending';
const LAST_UPDATED_AT_KEY = 'ddtLastUpdatedAt';

function normalizeCliente(cliente, destinatario = '') {
  if (cliente && typeof cliente === 'object') {
    return {
      riga1: String(cliente.riga1 ?? cliente.nome ?? destinatario ?? '').trim(),
      riga2: String(cliente.riga2 ?? '').trim(),
      riga3: String(cliente.riga3 ?? '').trim(),
    };
  }

  return {
    riga1: String(cliente ?? destinatario ?? '').trim(),
    riga2: '',
    riga3: '',
  };
}

function normalizeRigaStorage(riga) {
  return {
    codice_articolo: String(riga?.codice_articolo ?? riga?.descrizione ?? riga?.articolo ?? '').trim(),
    lotto: String(riga?.lotto ?? '').trim(),
    quantita: Math.max(1, Number(riga?.quantita) || 1),
  };
}

function normalizeDDTStorage(ddt) {
  const sourceRows = Array.isArray(ddt?.righe)
    ? ddt.righe
    : ddt?.articolo || ddt?.descrizione
      ? [{
          codice_articolo: ddt.codice_articolo ?? ddt.articolo ?? ddt.descrizione ?? '',
          lotto: ddt.lotto ?? '',
          quantita: ddt.quantita ?? 1,
        }]
      : [];

  return {
    numero: String(ddt?.numero ?? '').trim(),
    data: String(ddt?.data ?? ''),
    cliente: normalizeCliente(ddt?.cliente, ddt?.destinatario),
    causale_trasporto: String(ddt?.causale_trasporto ?? '').trim(),
    iniziali_paziente: String(ddt?.iniziali_paziente ?? '').trim(),
    cartella_clinica: String(ddt?.cartella_clinica ?? '').trim(),
    righe: sourceRows.map(normalizeRigaStorage),
    createdAt: ddt?.createdAt || new Date().toISOString(),
  };
}

function getDDTs() {
  const raw = localStorage.getItem(DDT_STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    const normalized = Array.isArray(parsed) ? parsed.map(normalizeDDTStorage) : [];
    localStorage.setItem(DDT_STORAGE_KEY, JSON.stringify(normalized));
    return normalized;
  } catch {
    return [];
  }
}

function saveDDTs(ddts) {
  const normalized = Array.isArray(ddts) ? ddts.map(normalizeDDTStorage) : [];
  localStorage.setItem(DDT_STORAGE_KEY, JSON.stringify(normalized));
}

function setLastUpdatedAt(value = new Date().toISOString()) {
  localStorage.setItem(LAST_UPDATED_AT_KEY, value);
}

function getLastUpdatedAt() {
  return localStorage.getItem(LAST_UPDATED_AT_KEY) || '';
}

function setBackupPending(value) {
  localStorage.setItem(BACKUP_PENDING_KEY, String(Boolean(value)));
}

function isBackupPending() {
  return localStorage.getItem(BACKUP_PENDING_KEY) === 'true';
}

function openCounterDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(COUNTER_DB_NAME, COUNTER_DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(COUNTER_STORE)) {
        db.createObjectStore(COUNTER_STORE, { keyPath: 'anno' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function getYearCode(dateString) {
  const date = dateString ? new Date(dateString) : new Date();
  const year = Number.isNaN(date.getTime()) ? new Date().getFullYear() : date.getFullYear();
  return String(year).slice(-2);
}

async function getNextDDTNumber(dateString) {
  const anno = getYearCode(dateString);
  const db = await openCounterDb();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(COUNTER_STORE, 'readwrite');
    const store = tx.objectStore(COUNTER_STORE);
    const getReq = store.get(anno);

    getReq.onsuccess = () => {
      const current = getReq.result || { anno, last: 0 };
      const next = Number(current.last || 0) + 1;
      store.put({ anno, last: next });
      resolve(`${anno}${String(next).padStart(3, '0')}GBE`);
    };

    getReq.onerror = () => reject(getReq.error);
    tx.onerror = () => reject(tx.error);
  }).finally(() => db.close());
}

function extractCounterFromNumero(numero) {
  const match = String(numero || '').match(/^(\d{2})(\d+)GBE$/i);
  if (!match) return null;

  return {
    anno: match[1],
    progressivo: Number(match[2]) || 0,
  };
}

async function getCounters() {
  const db = await openCounterDb();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(COUNTER_STORE, 'readonly');
    const store = tx.objectStore(COUNTER_STORE);
    const req = store.getAll();

    req.onsuccess = () => {
      const result = Array.isArray(req.result) ? req.result : [];
      resolve(
        result.map((item) => ({
          anno: String(item?.anno ?? '').trim(),
          last: Math.max(0, Number(item?.last) || 0),
        })),
      );
    };

    req.onerror = () => reject(req.error);
    tx.onerror = () => reject(tx.error);
  }).finally(() => db.close());
}

async function saveCounters(counters) {
  const db = await openCounterDb();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(COUNTER_STORE, 'readwrite');
    const store = tx.objectStore(COUNTER_STORE);

    store.clear();
    (Array.isArray(counters) ? counters : []).forEach((item) => {
      const anno = String(item?.anno ?? '').trim();
      if (!anno) return;
      store.put({ anno, last: Math.max(0, Number(item?.last) || 0) });
    });

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  }).finally(() => db.close());
}

function reconcileCountersWithDDTs(ddts, counters) {
  const merged = new Map();

  (Array.isArray(counters) ? counters : []).forEach((counter) => {
    const anno = String(counter?.anno ?? '').trim();
    if (!anno) return;
    merged.set(anno, Math.max(merged.get(anno) || 0, Number(counter?.last) || 0));
  });

  (Array.isArray(ddts) ? ddts : []).forEach((ddt) => {
    const parsed = extractCounterFromNumero(ddt?.numero);
    if (!parsed) return;
    merged.set(parsed.anno, Math.max(merged.get(parsed.anno) || 0, parsed.progressivo));
  });

  return [...merged.entries()].map(([anno, last]) => ({ anno, last }));
}

async function buildBackupPayload() {
  const ddt = getDDTs();
  const counters = await getCounters();
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    ddt,
    counters,
  };
}

async function backupToDrive() {
  if (!navigator.onLine) {
    setBackupPending(true);
    return { ok: false, offline: true };
  }

  try {
    const payload = await buildBackupPayload();
    const response = await fetch(BACKUP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    setBackupPending(false);
    setLastUpdatedAt(payload.updatedAt);
    return { ok: true };
  } catch (error) {
    console.error('Errore backup Drive:', error);
    setBackupPending(true);
    return { ok: false, offline: !navigator.onLine };
  }
}

async function retryPendingBackup() {
  if (!isBackupPending()) return { ok: true, skipped: true };
  return backupToDrive();
}

async function restoreFromDriveIfNeeded() {
  if (!navigator.onLine) {
    return { restored: false, reason: 'offline' };
  }

  try {
    const response = await fetch(BACKUP_URL, { method: 'GET' });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const text = (await response.text()).trim();
    if (!text) {
      return { restored: false, reason: 'empty' };
    }

    const remote = JSON.parse(text);
    if (!remote || !Array.isArray(remote.ddt) || !Array.isArray(remote.counters) || !remote.updatedAt) {
      return { restored: false, reason: 'invalid' };
    }

    const localUpdatedAt = getLastUpdatedAt();
    const remoteTs = Date.parse(remote.updatedAt) || 0;
    const localTs = Date.parse(localUpdatedAt) || 0;
    if (remoteTs <= localTs) {
      return { restored: false, reason: 'local_newer' };
    }

    const normalizedDDTs = remote.ddt.map(normalizeDDTStorage);
    saveDDTs(normalizedDDTs);

    const normalizedCounters = reconcileCountersWithDDTs(normalizedDDTs, remote.counters);
    await saveCounters(normalizedCounters);

    setLastUpdatedAt(remote.updatedAt);
    setBackupPending(false);
    return { restored: true };
  } catch (error) {
    console.error('Errore ripristino Drive:', error);
    return { restored: false, reason: 'error' };
  }
}
