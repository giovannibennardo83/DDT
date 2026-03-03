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
const scannerModal = document.getElementById('scanner-modal');
const scannerContainer = document.getElementById('scanner');
const scannerCloseButton = document.getElementById('scanner-close');
let activeHtml5QrCode = null;


const BACKUP_URL = 'https://script.google.com/macros/s/AKfycbzbF4v2-01P9AvsUWPhJFrdow5mPljOCiZYpZr_KrPIcB1qZmtzP53mTiFvI_ucw8g/exec';

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

function formatItem(ddt) {
  return `${ddt.numero || 'Senza numero'} - ${ddt.data} - ${ddt.cliente.riga1} (${formatRows(ddt.righe)})`;
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
      <button type="button" class="scan-btn secondary">📷 Scan</button>
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

  row.querySelector('.scan-btn').addEventListener('click', () => {
    startScanner(row);
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

async function backupToDrive() {
  console.log('PARTO BACKUP');

  try {
    const ddt = await getAllDDT();
    const counters = await getCounters();

    const data = {
      version: 1,
      updatedAt: new Date().toISOString(),
      ddt,
      counters,
    };

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
    console.log('SYNC START');

    const localDDT = await getAllDDT();
    const localCounters = await getCounters();
    void localCounters;

    const res = await fetch(BACKUP_URL + "?t=" + Date.now());
    const remote = await res.json();
    console.log("REMOTE:", remote);

    if (!remote || remote.empty) {
      console.log('SYNC: nessun dato remoto');
      return;
    }

    const remoteDDT = remote.ddt || [];
    console.log("REMOTE DDT:", remoteDDT.length);
    console.log("LOCAL DDT:", localDDT.length);
    
    const finalDDT = (remoteDDT || []).sort((a, b) => {
    const numA = parseInt((a.numero || '').replace(/\D/g, '') || '0');
    const numB = parseInt((b.numero || '').replace(/\D/g, '') || '0');
    return numB - numA;
    });
  
    await saveAllDDT(finalDDT);
    await updateCountersFromDDT(finalDDT);
    render(finalDDT);
    await fetch(BACKUP_URL, {
      method: 'POST',
      body: JSON.stringify({
        version: 1,
        updatedAt: new Date().toISOString(),
        ddt: finalDDT,
        counters: await getCounters(),
      })
    });

    console.log('SYNC OK');
  } catch (err) {
    console.error('SYNC ERROR', err);
  } finally {
    syncInProgress = false;
  }
}


async function stopScanner() {
  if (activeHtml5QrCode) {
    try {
      await activeHtml5QrCode.stop();
    } catch (error) {
      console.warn('Stop scanner warning:', error);
    }
    try {
      await activeHtml5QrCode.clear();
    } catch (error) {
      console.warn('Clear scanner warning:', error);
    }
    activeHtml5QrCode = null;
  }

  if (scannerModal) scannerModal.style.display = 'none';
  if (scannerContainer) scannerContainer.innerHTML = '';
  document.body.classList.remove('scanner-open');
}

function startScanner(row) {
  if (!window.isSecureContext) {
    alert('La scansione richiede HTTPS (o localhost).');
    return;
  }

  if (typeof Html5Qrcode === 'undefined') {
    alert('Scanner non disponibile.');
    return;
  }

  if (!scannerModal || !scannerContainer) {
    alert('Container scanner non disponibile.');
    return;
  }

  if (activeHtml5QrCode) {
    void stopScanner();
  }

  scannerModal.style.display = 'block';
  document.body.classList.add('scanner-open');
  activeHtml5QrCode = new Html5Qrcode('scanner');

  Html5Qrcode.getCameras()
    .then((devices) => {
      if (!devices.length) {
        alert('Nessuna camera trovata');
        return stopScanner();
      }

      const preferredCamera = devices.find((device) => /back|rear|environment/i.test(device.label || ''));
      const cameraId = (preferredCamera || devices[0]).id;

      return activeHtml5QrCode.start(
        cameraId,
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
        },
        (decodedText) => {
          const codiceInput = row.querySelector('.codice_articolo');
          const lottoInput = row.querySelector('.lotto');

          const parts = decodedText.split(/[\s|,;]/).filter(Boolean);

          codiceInput.value = parts[0] || '';
          lottoInput.value = parts[1] || '';

          clearFieldError(codiceInput);
          clearFieldError(lottoInput);

          void stopScanner();
        },
        () => {
          // opzionale
        },
      );
    })
    .catch((error) => {
      console.error('Errore scanner:', error);
      alert('Impossibile avviare la fotocamera. Verifica i permessi.');
      void stopScanner();
    });
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

      await backupToDrive();
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
  backupToDrive();
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


if (scannerCloseButton) {
  scannerCloseButton.addEventListener('click', () => {
    void stopScanner();
  });
}

if (scannerModal) {
  scannerModal.addEventListener('click', (event) => {
    if (event.target === scannerModal) {
      void stopScanner();
    }
  });
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
