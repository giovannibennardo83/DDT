const MITTENTE_FISSO = [
  'Zimmer Biomet c/o',
  'Migliori Service s.r.l. Unipersonale',
  'Via Catira Savoca 1',
  '95037 San Giovanni La Punta (CT)',
  'Cod. Fisc. e P. Iva 04658810876',
  'Tel. 095 7894844 - Fax 095 7895283',
].join('\n');

const form = document.getElementById('ddt-form');
const list = document.getElementById('ddt-list');
const printLastButton = document.getElementById('print-last');
const addRowButton = document.getElementById('add-row');
const righeContainer = document.getElementById('righe-container');
const cancelEditButton = document.getElementById('cancel-edit');
const formTitle = document.getElementById('form-title');
const ocrInputCamera = document.getElementById('ocr-input-camera');
const ocrInputGallery = document.getElementById('ocr-input-gallery');
const ocrScaricoButton = document.getElementById('ocr-scarico-btn');
const ocrScaricoGalleryButton = document.getElementById('ocr-scarico-gallery-btn');
const ocrScaricoInputCamera = document.getElementById('ocr-scarico-input-camera');
const ocrScaricoInputGallery = document.getElementById('ocr-scarico-input-gallery');
const ocrStatus = document.getElementById('ocr-status');
const ocrPreview = document.getElementById('ocr-preview');
let activeOcrRow = null;


const BACKUP_URL = 'https://script.google.com/macros/s/AKfycbzbF4v2-01P9AvsUWPhJFrdow5mPljOCiZYpZr_KrPIcB1qZmtzP53mTiFvI_ucw8g/exec';
const OCR_URL = 'https://ddt-chi.vercel.app/api/ocr';
const numeroInput = document.getElementById('numero');
const dataInput = document.getElementById('data');
const clienteRiga1Input = document.getElementById('cliente_riga1');
const clienteRiga2Input = document.getElementById('cliente_riga2');
const clienteRiga3Input = document.getElementById('cliente_riga3');
const causaleInput = document.getElementById('causale_trasporto');
const inizialiInput = document.getElementById('iniziali_paziente');
const cartellaInput = document.getElementById('cartella_clinica');
const saveButton = document.getElementById('save-ddt-btn');
const newDDTButton = document.getElementById('new-ddt-btn');
const saveStatus = document.getElementById('save-status');

let editingIndex = null;
let syncInProgress = false;
let isSaving = false;
let saveStatusTimeout = null;

function setSavingState(saving) {
  isSaving = saving;
  if (!saveButton) return;

  saveButton.disabled = saving;
  saveButton.innerHTML = saving
    ? '<span class="save-spinner" aria-hidden="true"></span>Sto salvando...'
    : 'Salva DDT';
  
  if (saveStatus && saving) {
    saveStatus.textContent = 'Sto salvando...';
    }
  
}


function showSaveToast(message, type = 'success') {
  if (!saveStatus) return;

  if (saveStatusTimeout) {
    clearTimeout(saveStatusTimeout);
    saveStatusTimeout = null;
  }

  saveStatus.textContent = message;
  saveStatus.classList.remove('is-success', 'is-error');
  saveStatus.classList.add(type === 'error' ? 'is-error' : 'is-success');

  saveStatusTimeout = setTimeout(() => {
    saveStatus.textContent = '';
    saveStatus.classList.remove('is-success', 'is-error');
    saveStatusTimeout = null;
  }, 3000);
}

function createEmptyRiga() {
  return { codice_articolo: '', description: '', lotto: '', quantita: 1 };
}

function normalizeRiga(riga) {
  return {
    codice_articolo: String(riga?.codice_articolo ?? riga?.descrizione ?? riga?.articolo ?? '').trim(),
    description: String(riga?.description ?? '').trim(),
    lotto: String(riga?.lotto ?? '').trim(),
    quantita: Math.max(1, Number(riga?.quantita) || 1),
  };
}

function formatRows(righe = []) {
  return righe.map((riga) => `${riga.codice_articolo}${riga.description ? ' - ' + riga.description : ''} | ${riga.lotto} x${riga.quantita}`).join(' · ');
}

function formatDisplayDate(value) {
  const input = String(value || '').trim();
  const match = input.match(/^(\d{4})[-/](\d{2})[-/](\d{2})$/);
  if (!match) return input;
  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}

function formatItem(ddt) {
  return `${ddt.numero || 'Senza numero'} - ${formatDisplayDate(ddt.data)} - ${ddt.cliente.riga1} (${formatRows(ddt.righe)})`;
}

function setSimpleFieldError(input, message) {
  input.classList.add('input-error');
  const small = input.parentElement.querySelector('.error-message');
  if (small) small.textContent = message;
}

function clearSimpleFieldError(input) {
  input.classList.remove('input-error');
  const small = input.parentElement.querySelector('.error-message');
  if (small) small.textContent = '';
}

function renderRow(riga = createEmptyRiga()) {
  const row = document.createElement('div');
  row.className = 'riga-row';
  row.innerHTML = `
    <div class="field-with-actions">
      <input type="text" class="codice_articolo" value="${riga.codice_articolo}" placeholder="Codice articolo" />
      <small class="error-message"></small>
    </div>

    <div class="field-with-actions description-wrap">
      <input type="text" class="description" value="${riga.description}" placeholder="Descrizione" />
      <small class="error-message"></small>
    </div>

    <div class="field-with-actions">
      <input type="text" class="lotto" value="${riga.lotto}" placeholder="Lotto" />
      <div class="ocr-row-tools">
        <p class="ocr-row-title">OCR prodotto</p>
        <p class="ocr-row-subtitle">Scansiona un singolo bollino</p>
      <div class="ocr-actions ocr-actions-row">
        <button type="button" class="ocr-scan-camera secondary">📷 Scatta foto</button>
        <button type="button" class="ocr-scan-gallery secondary">🖼️ Carica da galleria</button>
      </div>
      </div>
      <small class="error-message"></small>
    </div>

    <div class="field-with-actions qty-wrap">
      <input type="number" class="quantita" value="${riga.quantita}" min="1" placeholder="Quantità" />
      <button type="button" class="danger remove-row">Rimuovi riga</button>
      <small class="error-message"></small>
    </div>
  `;

  row.querySelector('.remove-row').addEventListener('click', () => {
    row.remove();
    if (righeContainer.children.length === 0) {
      addRiga();
    }
  });

  row.querySelector('.ocr-scan-camera').addEventListener('click', () => startOcrForRow(row, 'camera'));
  row.querySelector('.ocr-scan-gallery').addEventListener('click', () => startOcrForRow(row, 'gallery'));

  row.querySelectorAll('input').forEach((input) => {
    input.addEventListener('input', () => clearFieldError(input));
  });

  righeContainer.appendChild(row);
}

function addRiga() {
  renderRow(createEmptyRiga());
}

function setFieldError(input, message) {
  input.classList.add('input-error');
  const small = input.closest('.field-with-actions').querySelector('.error-message');
  small.textContent = message;
}

function clearFieldError(input) {
  input.classList.remove('input-error');
  const small = input.closest('.field-with-actions').querySelector('.error-message');
  small.textContent = '';
}

function extractAndValidateRighe() {
  const rows = [...righeContainer.querySelectorAll('.riga-row')];
  const result = [];
  let valid = true;

  if (rows.length === 0) {
    valid = false;
    addRiga();
  }

  rows.forEach((row) => {
    const codice = row.querySelector('.codice_articolo');
    const description = row.querySelector('.description');
    const lotto = row.querySelector('.lotto');
    const quantita = row.querySelector('.quantita');

    const normalized = normalizeRiga({
      codice_articolo: codice.value,
      description: description.value,
      lotto: lotto.value,
      quantita: quantita.value,
    });

    if (!normalized.codice_articolo) {
      setFieldError(codice, 'Obbligatorio');
      valid = false;
    }

    if (!normalized.lotto) {
      setFieldError(lotto, 'Obbligatorio');
      valid = false;
    }

    if (!Number.isFinite(normalized.quantita) || normalized.quantita < 1) {
      setFieldError(quantita, 'Minimo 1');
      valid = false;
    }

    result.push(normalized);
  });

  return { valid, righe: result };
}

function resetFormState() {
  editingIndex = null;
  formTitle.textContent = 'Nuovo DDT';
  cancelEditButton.hidden = true;
  form.reset();
  numeroInput.value = '';
  numeroInput.placeholder = 'Assegnato al salvataggio';
  righeContainer.innerHTML = '';
  addRiga();
}

function loadInForm(ddt, index) {
  editingIndex = index;
  formTitle.textContent = `Modifica DDT ${ddt.numero}`;
  cancelEditButton.hidden = false;
  numeroInput.value = ddt.numero;
  dataInput.value = ddt.data;
  clienteRiga1Input.value = ddt.cliente.riga1 || '';
  clienteRiga2Input.value = ddt.cliente.riga2 || '';
  clienteRiga3Input.value = ddt.cliente.riga3 || '';
  causaleInput.value = ddt.causale_trasporto || '';
  inizialiInput.value = ddt.iniziali_paziente || '';
  cartellaInput.value = ddt.cartella_clinica || '';

  righeContainer.innerHTML = '';
  if (!ddt.righe.length) {
    addRiga();
  } else {
    ddt.righe.forEach((riga) => renderRow(normalizeRiga(riga)));
  }
}

function saveAndPrint(ddt) {
  localStorage.setItem('printDDT', JSON.stringify({ ...ddt, mittente: MITTENTE_FISSO }));
  const printWindow = window.open('print.html', '_blank');
  if (!printWindow) {
    alert('Impossibile aprire la finestra di stampa.');
  }
}

async function backupToDrive(options = {}) {
  const { skipRemoteSafetyCheck = false } = options;
  console.log('PARTO BACKUP');

  try {
    const ddt = await getAllDDT();
    const counters = await getCounters();
    const localUpdatedAt = new Date().toISOString();

    const data = {
      version: 1,
      updatedAt: localUpdatedAt,
      ddt,
      counters,
    };

    if (!skipRemoteSafetyCheck) {
      const remoteRes = await fetch(BACKUP_URL + '?t=' + Date.now());
      const remote = await remoteRes.json();

      const remoteDate = remote?.updatedAt ? new Date(remote.updatedAt) : null;
      const localDate = new Date(localUpdatedAt);
      const remoteIsNewer = remoteDate instanceof Date
        && !Number.isNaN(remoteDate.getTime())
        && remoteDate > localDate;

      if (remoteIsNewer) {
        console.log('Backup bloccato: remoto più recente');
        return;
      }
    }

    fetch(BACKUP_URL, {
      method: 'POST',
      body: JSON.stringify(data),
    })
      .then((res) => res.json())
      .then((json) => {
        console.log('BACKUP OK', json);
      })
      .catch((err) => {
        console.error('BACKUP ERROR', err);
      });
  } catch (err) {
    console.error('BACKUP ERROR', err);
  }
}

function mergeDDTLists(localDDT = [], remoteDDT = []) {
  const mergedById = new Map();

  const consider = (item) => {
    if (!item) return;
    const key = item.id || item.numero;
    if (!key) return;

    const existing = mergedById.get(key);
    if (!existing) {
      mergedById.set(key, item);
      return;
    }

    const itemUpdatedAt = new Date(item.updatedAt || 0).getTime() || 0;
    const existingUpdatedAt = new Date(existing.updatedAt || 0).getTime() || 0;

    if (itemUpdatedAt >= existingUpdatedAt) {
      mergedById.set(key, item);
    }
  };

  localDDT.forEach(consider);
  remoteDDT.forEach(consider);

  return [...mergedById.values()].sort((a, b) => {
    const numA = parseInt((a.numero || '').replace(/\D/g, ''), 10) || 0;
    const numB = parseInt((b.numero || '').replace(/\D/g, ''), 10) || 0;
    return numB - numA;
  });
}

async function syncDDT() {
  if (!navigator.onLine) return;
  if (syncInProgress) return;
  syncInProgress = true;

  try {
    console.log("SYNC START");
    const localDDT = await getAllDDT();
    const res = await fetch(BACKUP_URL + "?t=" + Date.now());
    const remote = await res.json();
    console.log("REMOTE:", remote);

    const remoteDDT = Array.isArray(remote?.ddt) ? remote.ddt : [];
    console.log("REMOTE DDT:", remoteDDT.length);
    console.log("LOCAL DDT:", localDDT.length);

    const finalDDT = mergeDDTLists(localDDT, remoteDDT);

    // salva locale
    await saveAllDDT(finalDDT);
    // aggiorna contatori
    await updateCountersFromDDT(finalDDT);
    render(finalDDT);
    console.log("SYNC OK");
  } catch(err) {
    console.error("SYNC ERROR", err);
  } finally {
    syncInProgress = false;
  }
}

const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/tiff', 'image/heic', 'image/heif']);
const MAX_LONG_SIDE = 1600;

function setOcrStatus(message) {
  if (ocrStatus) ocrStatus.textContent = message || '';
}

function validateImageFile(file) {
  if (!file || !String(file.type || '').startsWith('image/')) throw new Error('File non immagine.');
  const isKnown = SUPPORTED_IMAGE_TYPES.has(file.type);
  if (!isKnown && file.type) throw new Error(`Formato non supportato: ${file.type}`);
}

async function compressImage(file) {
  validateImageFile(file);
  const quality = file.size > 5 * 1024 * 1024 ? 0.6 : file.size > 2 * 1024 * 1024 ? 0.7 : 0.8;
  const reader = new FileReader();
  const img = new Image();

  const dataUrl = await new Promise((resolve, reject) => {
    reader.onload = (event) => resolve(event.target?.result);
    reader.onerror = () => reject(new Error('Lettura file fallita.'));
    reader.readAsDataURL(file);
  });

  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = () => reject(new Error(file.type.includes('heic') || file.type.includes('heif') ? 'Formato HEIC/HEIF non supportato dal browser.' : 'Immagine non decodificabile.'));
    img.src = dataUrl;
  });

  let width = img.width;
  let height = img.height;
  const longSide = Math.max(width, height);
  if (longSide > MAX_LONG_SIDE) {
    const ratio = MAX_LONG_SIDE / longSide;
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas non disponibile.');
  ctx.drawImage(img, 0, 0, width, height);

  const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
  return {
    previewUrl: compressedDataUrl,
    imageBase64: compressedDataUrl.split(',')[1],
  };
}

function startOcrForRow(row, source = 'camera') {
  const input = source === 'gallery' ? ocrInputGallery : ocrInputCamera;
  if (!input) {
    alert('Input foto non disponibile.');
    return;
  }
  setOcrStatus('');
  activeOcrRow = row;
  input.value = '';
  input.click();
}

function startOcrScaricoDocumento(source = 'camera') {
  const input = source === 'gallery' ? ocrScaricoInputGallery : ocrScaricoInputCamera;
  if (!input) {
    alert('Input documento non disponibile.');
    return;
  }
  setOcrStatus('');
  input.value = '';
  input.click();
}

function normalizeOcrDate(value) {
  const input = String(value || '').trim();
  if (!input) return '';

  const isoMatch = input.match(/^(\d{4})[-/](\d{2})[-/](\d{2})$/);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    if (
      Number.isInteger(year) &&
      month >= 1 &&
      month <= 12 &&
      day >= 1 &&
      day <= 31
    ) {
      return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
    return '';
  }

  const itMatch = input.match(/^(\d{2})[./-](\d{2})[./-](\d{2}|\d{4})$/);
  if (itMatch) {
    const day = Number(itMatch[1]);
    const month = Number(itMatch[2]);
    const yearRaw = itMatch[3];
    const year = yearRaw.length === 2
      ? (Number(yearRaw) <= 69 ? 2000 + Number(yearRaw) : 1900 + Number(yearRaw))
      : Number(yearRaw);

    if (
      month >= 1 &&
      month <= 12 &&
      day >= 1 &&
      day <= 31
    ) {
      return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
    return '';
  }

  return '';
}

function normalizeScaricoRighe(righe = []) {
  const grouped = new Map();

  righe.forEach((riga) => {
    const codice = String(riga?.codice_articolo ?? '').trim();
    if (!codice) return;

    const lotto = String(riga?.lotto ?? '').trim();
    const quantita = Math.max(1, Number(riga?.quantita) || 1);
    const key = `${codice}__${lotto}`;
    const existing = grouped.get(key);

    if (existing) {
      existing.quantita += quantita;
      return;
    }

    grouped.set(key, {
      codice_articolo: codice,
      description: String(riga?.description ?? '').trim(),
      lotto,
      quantita,
    });
  });

  return [...grouped.values()];
}

function applyScaricoDataToForm(result) {
  const cliente = String(result?.cliente ?? '').trim();
  const data = normalizeOcrDate(result?.data);
  const inizialiPaziente = String(result?.iniziali_paziente ?? '').trim();
  const cartellaClinica = String(result?.cartella_clinica ?? '').trim();
  const righe = normalizeScaricoRighe(result?.righe || []);

  if (cliente) clienteRiga1Input.value = cliente;
  if (data) dataInput.value = data;
  if (inizialiPaziente) inizialiInput.value = inizialiPaziente;
  if (cartellaClinica) cartellaInput.value = cartellaClinica;

  if (righe.length) {
    righeContainer.innerHTML = '';
    righe.forEach((riga) => renderRow(riga));
  }
}

async function handleOcrFileChange(event) {
  const file = event.target.files?.[0];
  const row = activeOcrRow;

  if (!file || !row) return;

  try {
    setOcrStatus('Compressione immagine in corso...');
    const { imageBase64, previewUrl } = await compressImage(file);
    if (ocrPreview) {
      ocrPreview.src = previewUrl;
      ocrPreview.hidden = false;
    }
    setOcrStatus('OCR in corso...');
    const response = await fetch(OCR_URL, {
  method: "POST",
  headers: {
    "Content-Type": "application/json"
  },    
  body: JSON.stringify({ imageBase64 }),
  });

    if (!response.ok) {
      throw new Error(`OCR HTTP ${response.status}`);
    }

    const result = await response.json();
    const ref = String(result?.ref || '').trim();
    const lot = String(result?.lot || '').trim();

    const codiceInput = row.querySelector('.codice_articolo');
    const lottoInput = row.querySelector('.lotto');

    codiceInput.value = ref;
    lottoInput.value = lot;

    if (ref) clearFieldError(codiceInput);
    if (lot) clearFieldError(lottoInput);

    if (!ref || !lot) {
      alert('REF o LOT non rilevati. Riprovare con foto più vicina.');
    }
  } catch (error) {
    console.error('Errore OCR:', error);
    alert('Impossibile leggere la foto. Riprovare.');
  } finally {
    activeOcrRow = null;
    setOcrStatus('');
    if (ocrInputCamera) ocrInputCamera.value = '';
    if (ocrInputGallery) ocrInputGallery.value = '';
  }
}

async function handleOcrScaricoFileChange(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    setOcrStatus('Compressione immagine in corso...');
    const { imageBase64, previewUrl } = await compressImage(file);
    if (ocrPreview) {
      ocrPreview.src = previewUrl;
      ocrPreview.hidden = false;
    }
    setOcrStatus('OCR in corso...');
    const response = await fetch(OCR_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        imageBase64,
        mode: 'document',
      }),
    });

    if (!response.ok) {
      throw new Error(`OCR HTTP ${response.status}`);
    }

    const result = await response.json();
    applyScaricoDataToForm(result);
  } catch (error) {
    console.error('Errore OCR scarico documento:', error);
    alert('Documento non leggibile');
  } finally {
    setOcrStatus('');
    if (ocrScaricoInputCamera) ocrScaricoInputCamera.value = '';
    if (ocrScaricoInputGallery) ocrScaricoInputGallery.value = '';
  }
}

function render(ddts) {
    ddts = [...ddts].sort((a, b) => {
    const numA = parseInt((a.numero || '').replace(/\D/g, '') || '0');
    const numB = parseInt((b.numero || '').replace(/\D/g, '') || '0');
    return numB - numA;
  });
  list.innerHTML = '';
  const visibleDDT = ddts;

  visibleDDT.forEach((ddt) => {
    const index = ddts.findIndex((currentDDT) => currentDDT.id === ddt.id);
    const li = document.createElement('li');

    const text = document.createElement('span');
    text.textContent = formatItem(ddt);

    const buttons = document.createElement('div');
    buttons.className = 'item-buttons';

    const editButton = document.createElement('button');
    editButton.textContent = 'Modifica';
    editButton.className = 'secondary';
    editButton.addEventListener('click', () => loadInForm(ddt, index));

    const printButton = document.createElement('button');
    printButton.textContent = 'Stampa';
    printButton.addEventListener('click', () => saveAndPrint(ddt));

    const deleteButton = document.createElement('button');
    deleteButton.textContent = 'Elimina';
    deleteButton.className = 'danger';
    deleteButton.addEventListener('click', async () => {
      if (!confirm("Sei sicuro di voler eliminare questo DDT? Questa operazione non è reversibile.")) return;

      const updated = getDDTs();
      if (index < 0 || index >= updated.length) return;

      // eliminazione reale
      updated.splice(index, 1);

      saveDDTs(updated);
      render(updated);

      if (editingIndex === index) {
        resetFormState();
      }

      console.log('DDT ELIMINATO DEFINITIVAMENTE');

      backupToDrive({ skipRemoteSafetyCheck: true });
    });

    buttons.append(editButton, printButton, deleteButton);
    li.append(text, buttons);
    list.appendChild(li);
  });
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (isSaving) return;

  clearSimpleFieldError(clienteRiga1Input);

  const { valid, righe } = extractAndValidateRighe();
  let formValid = valid;

  if (!clienteRiga1Input.value.trim()) {
    setSimpleFieldError(clienteRiga1Input, 'Obbligatorio');
    formValid = false;
  }

  if (!formValid) return;

  setSavingState(true);

  try {
    const current = getDDTs();
    const existing = editingIndex === null ? null : current[editingIndex];

    const ddt = {
      id: existing?.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `ddt-${Date.now()}`),
      numero: existing?.numero || '',
      data: dataInput.value,
      cliente: {
        riga1: clienteRiga1Input.value.trim(),
        riga2: clienteRiga2Input.value.trim(),
        riga3: clienteRiga3Input.value.trim(),
      },
      causale_trasporto: causaleInput.value.trim(),
      iniziali_paziente: inizialiInput.value.trim(),
      cartella_clinica: cartellaInput.value.trim(),
      righe,
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (!ddt.numero) {
      ddt.numero = await getNextDDTNumber(ddt.data);
    }

    if (editingIndex === null) {
      current.unshift(ddt);
      editingIndex = current.findIndex((item) => item.id === ddt.id);
    } else {
      current[editingIndex] = ddt;
    }

    saveDDTs(current);
    console.log('SALVATAGGIO DDT');
    backupToDrive({ skipRemoteSafetyCheck: true });
    render(current.sort((a, b) => {
      const numA = parseInt((a.numero || '').replace(/\D/g, '') || '0');
      const numB = parseInt((b.numero || '').replace(/\D/g, '') || '0');
      return numB - numA;
    }));

    showSaveToast('DDT salvato correttamente', 'success');
  } catch (error) {
    console.error('Errore durante il salvataggio DDT:', error);
    showSaveToast('Errore durante il salvataggio', 'error');
  } finally {
    setSavingState(false);
  }
});

addRowButton.addEventListener('click', addRiga);

cancelEditButton.addEventListener('click', resetFormState);
if (newDDTButton) newDDTButton.addEventListener('click', resetFormState);

printLastButton.addEventListener('click', () => {
  const all = getDDTs();
  if (all.length === 0) {
    alert('Nessun DDT disponibile da stampare.');
    return;
  }

  saveAndPrint(all[0]);
});


if (ocrInputCamera) ocrInputCamera.addEventListener('change', handleOcrFileChange);
if (ocrInputGallery) ocrInputGallery.addEventListener('change', handleOcrFileChange);
if (ocrScaricoButton) ocrScaricoButton.addEventListener('click', () => startOcrScaricoDocumento('camera'));
if (ocrScaricoGalleryButton) ocrScaricoGalleryButton.addEventListener('click', () => startOcrScaricoDocumento('gallery'));
if (ocrScaricoInputCamera) ocrScaricoInputCamera.addEventListener('change', handleOcrScaricoFileChange);
if (ocrScaricoInputGallery) ocrScaricoInputGallery.addEventListener('change', handleOcrScaricoFileChange);

[clienteRiga1Input].forEach((input) => {
  input.addEventListener('input', () => clearSimpleFieldError(input));
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch((error) => {
    console.error('Service worker non registrato:', error);
  });
}

resetFormState();

(async () => {
  await syncDDT();
})();
setInterval(syncDDT, 300000);
window.addEventListener('online', syncDDT);
