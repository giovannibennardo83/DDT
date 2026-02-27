const DDT_STORAGE_KEY = 'ddtRecords';

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
    cliente: String(ddt?.cliente ?? '').trim(),
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
