const DDT_STORAGE_KEY = 'ddtRecords';

function getDDTs() {
  const raw = localStorage.getItem(DDT_STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveDDTs(ddts) {
  localStorage.setItem(DDT_STORAGE_KEY, JSON.stringify(ddts));
}
