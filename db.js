const DDT_STORAGE_KEY = 'ddtRecords';
const COUNTER_DB_NAME = 'ddt-db';
const COUNTER_DB_VERSION = 1;
const COUNTER_STORE = 'counters';

function generateDDTId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `ddt-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

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

  const normalized = {
    id: String(ddt?.id ?? generateDDTId()),
    numero: String(ddt?.numero ?? '').trim(),
    data: String(ddt?.data ?? ''),
    cliente: normalizeCliente(ddt?.cliente, ddt?.destinatario),
    causale_trasporto: String(ddt?.causale_trasporto ?? '').trim(),
    iniziali_paziente: String(ddt?.iniziali_paziente ?? '').trim(),
    cartella_clinica: String(ddt?.cartella_clinica ?? '').trim(),
    righe: sourceRows.map(normalizeRigaStorage),
  };

  if (ddt?.createdAt) {
    normalized.createdAt = ddt.createdAt;
  }

  if (ddt?.updatedAt) {
    normalized.updatedAt = ddt.updatedAt;
  }

  return normalized;
}

function getDDTs() {
  const raw = localStorage.getItem(DDT_STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(normalizeDDTStorage) : [];
  } catch {
    return [];
  }
}

function saveDDTs(ddts) {
  const normalized = Array.isArray(ddts) ? ddts.map(normalizeDDTStorage) : [];
  localStorage.setItem(DDT_STORAGE_KEY, JSON.stringify(normalized));
}

async function saveAllDDT(ddts) {
  saveDDTs(ddts);
}

async function getAllDDT() {
  return getDDTs();
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

  const all = await getAllDDT();

  let max = 0;

  all.forEach(d => {
    if (!d.numero) return;

    const dAnno = d.numero.substring(0, 2);
    const progressivo = parseInt(d.numero.substring(2, 5), 10);

    if (dAnno === anno && Number.isFinite(progressivo)) {
      if (progressivo > max) max = progressivo;
    }
  });

  const next = max + 1;

  // aggiorna comunque il counter (backup)
  const counters = await getCounters();
  const updated = {};
  counters.forEach(c => updated[c.anno] = c.last);
  updated[anno] = next;
  await saveCounters(updated);

  return `${anno}${String(next).padStart(3, '0')}GBE`;
}
  
async function getCounters() {
  const db = await openCounterDb();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(COUNTER_STORE, 'readonly');
    const store = tx.objectStore(COUNTER_STORE);
    const req = store.getAll();

    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
    tx.onerror = () => reject(tx.error);
  }).finally(() => db.close());
}

async function saveCounters(counters) {
  const db = await openCounterDb();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(COUNTER_STORE, 'readwrite');
    const store = tx.objectStore(COUNTER_STORE);

    const clearReq = store.clear();

    clearReq.onsuccess = () => {
      Object.entries(counters || {}).forEach(([anno, last]) => {
        store.put({ anno, last: Number(last) || 0 });
      });
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    clearReq.onerror = () => reject(clearReq.error);
  }).finally(() => db.close());
}

async function updateCountersFromDDT(ddtList) {
  const counters = {};

  (ddtList || []).forEach((d) => {
    if (!d?.numero) return;

    const anno = d.numero.substring(0, 2);
    const progressivo = parseInt(d.numero.substring(2, 5), 10);

    if (!Number.isFinite(progressivo)) return;

    if (!counters[anno] || progressivo > counters[anno]) {
      counters[anno] = progressivo;
    }
  });

  await saveCounters(counters);
}
