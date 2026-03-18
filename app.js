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
const ocrInput = document.getElementById('ocr-input');
let activeOcrRow = null;


const BACKUP_URL = 'https://script.google.com/macros/s/AKfycbzbF4v2-01P9AvsUWPhJFrdow5mPljOCiZYpZr_KrPIcB1qZmtzP53mTiFvI_ucw8g/exec';
const OCR_URL = 'https://script.google.com/macros/s/AKfycbyiibZkAgoBF_4UZzfOv6uu6hVXb4IzZWCvab07UXeBSSUCCitaX3Q6ncX3QrjHyoy6/exec';

const numeroInput = document.getElementById('numero');
const dataInput = document.getElementById('data');
const clienteRiga1Input = document.getElementById('cliente_riga1');
const clienteRiga2Input = document.getElementById('cliente_riga2');
const clienteRiga3Input = document.getElementById('cliente_riga3');
const causaleInput = document.getElementById('causale_trasporto');
const inizialiInput = document.getElementById('iniziali_paziente');
const cartellaInput = document.getElementById('cartella_clinica');

let editingIndex = null;
let syncInProgress = false;

function createEmptyRiga() {
  return { codice_articolo: '', lotto: '', quantita: 1 };
}

function normalizeRiga(riga) {
  return {
    codice_articolo: String(riga?.codice_articolo ?? riga?.descrizione ?? riga?.articolo ?? '').trim(),
    lotto: String(riga?.lotto ?? '').trim(),
    quantita: Math.max(1, Number(riga?.quantita) || 1),
  };
}

function formatRows(righe = []) {
  return righe.map((riga) => `${riga.codice_articolo} | ${riga.lotto} x${riga.quantita}`).join(' · ');
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

    <div class="field-with-actions">
      <input type="text" class="lotto" value="${riga.lotto}" placeholder="Lotto" />
      <button type="button" class="ocr-scan secondary">📷 Leggi REF e LOT da foto</button>
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

  row.querySelector('.ocr-scan').addEventListener('click', () => {
    startOcrForRow(row);
  });

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
    const lotto = row.querySelector('.lotto');
    const quantita = row.querySelector('.quantita');

    const normalized = normalizeRiga({
      codice_articolo: codice.value,
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

    const res = await fetch(BACKUP_URL, {
      method: 'POST',
      body: JSON.stringify(data),
    });

    const json = await res.json();
    console.log('BACKUP OK', json);
  } catch (err) {
    console.error('BACKUP ERROR', err);
  }
}

async function syncDDT() {
  if (syncInProgress) return;
  syncInProgress = true;

  try {
    console.log("SYNC START");
    const localDDT = await getAllDDT();
    const res = await fetch(BACKUP_URL + "?t=" + Date.now());
    const remote = await res.json();
    console.log("REMOTE:", remote);

    // 🔴 CASO 1: DRIVE VUOTO
    if (!remote || remote.empty || !remote.ddt || remote.ddt.length === 0) {
      console.log("DRIVE VUOTO → carico dati locali");
      await backupToDrive();
      const sorted = localDDT.sort((a,b)=>{
        const numA = parseInt((a.numero || '').replace(/\D/g,'')) || 0;
        const numB = parseInt((b.numero || '').replace(/\D/g,'')) || 0;
        return numB - numA;
      });

      render(sorted);
      return;
    }
    // 🟢 CASO 2: DRIVE HA DATI
    const remoteDDT = remote.ddt || [];
    console.log("REMOTE DDT:", remoteDDT.length);
    console.log("LOCAL DDT:", localDDT.length);
    // rimuove duplicati per numero
    const unique = {};
    remoteDDT.forEach(d => {
      const key = d.numero;
      if (!unique[key]) {
        unique[key] = d;
      } else {
        if (new Date(d.updatedAt) > new Date(unique[key].updatedAt)) {
          unique[key] = d;
        }
      }

    });
    const cleanedDDT = Object.values(unique);
    // ordina
    const finalDDT = cleanedDDT.sort((a,b)=>{
      const numA = parseInt((a.numero || '').replace(/\D/g,'')) || 0;
      const numB = parseInt((b.numero || '').replace(/\D/g,'')) || 0;
      return numB - numA;
    });
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

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const raw = typeof reader.result === 'string' ? reader.result : '';
      const base64 = raw.includes(',') ? raw.split(',')[1] : raw;
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('Impossibile leggere la foto.'));
    reader.readAsDataURL(file);
  });
}

function startOcrForRow(row) {
  if (!ocrInput) {
    alert('Input foto non disponibile.');
    return;
  }

  activeOcrRow = row;
  ocrInput.value = '';
  ocrInput.click();
}

async function handleOcrFileChange(event) {
  const file = event.target.files?.[0];
  const row = activeOcrRow;

  if (!file || !row) return;

  try {
    const imageBase64 = await fileToBase64(file);
    const response = await fetch(OCR_URL + "?imageBase64=" + encodeURIComponent(imageBase64));

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
    if (ocrInput) ocrInput.value = '';
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

      await backupToDrive({ skipRemoteSafetyCheck: true });
      await syncDDT();
    });

    buttons.append(editButton, printButton, deleteButton);
    li.append(text, buttons);
    list.appendChild(li);
  });
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  clearSimpleFieldError(clienteRiga1Input);

  const { valid, righe } = extractAndValidateRighe();
  let formValid = valid;

  if (!clienteRiga1Input.value.trim()) {
    setSimpleFieldError(clienteRiga1Input, 'Obbligatorio');
    formValid = false;
  }

  if (!formValid) return;

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
  } else {
    current[editingIndex] = ddt;
  }

  saveDDTs(current);
  console.log('SALVATAGGIO DDT');
  backupToDrive({ skipRemoteSafetyCheck: true });
  syncDDT();
  resetFormState();
  render(current.sort((a, b) => {
  const numA = parseInt((a.numero || '').replace(/\D/g, '') || '0');
  const numB = parseInt((b.numero || '').replace(/\D/g, '') || '0');
  return numB - numA;
}));
});

addRowButton.addEventListener('click', addRiga);

cancelEditButton.addEventListener('click', resetFormState);

printLastButton.addEventListener('click', () => {
  const all = getDDTs();
  if (all.length === 0) {
    alert('Nessun DDT disponibile da stampare.');
    return;
  }

  saveAndPrint(all[0]);
});


if (ocrInput) {
  ocrInput.addEventListener('change', handleOcrFileChange);
}

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
