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
const syncFeedback = document.getElementById('sync-feedback');

const numeroInput = document.getElementById('numero');
const dataInput = document.getElementById('data');
const clienteRiga1Input = document.getElementById('cliente_riga1');
const clienteRiga2Input = document.getElementById('cliente_riga2');
const clienteRiga3Input = document.getElementById('cliente_riga3');
const causaleInput = document.getElementById('causale_trasporto');
const inizialiInput = document.getElementById('iniziali_paziente');
const cartellaInput = document.getElementById('cartella_clinica');

let editingIndex = null;

function showSyncFeedback(message, isError = false) {
  if (!syncFeedback) return;
  syncFeedback.textContent = message;
  syncFeedback.classList.toggle('error', isError);
}

async function persistAndSync(ddts) {
  saveDDTs(ddts);
  setLastUpdatedAt();

  const result = await backupToDrive();
  if (result.ok) {
    showSyncFeedback('DDT salvato in Drive');
  } else if (!result.offline) {
    showSyncFeedback('Errore backup Drive', true);
  }
}

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

function render(ddts) {
  list.innerHTML = '';

  ddts.forEach((ddt, index) => {
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
    deleteButton.addEventListener('click', () => {
      const updated = getDDTs();
      updated.splice(index, 1);
      persistAndSync(updated);
      render(updated);
      if (editingIndex === index) {
        resetFormState();
      }
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
  };

  if (!ddt.numero) {
    ddt.numero = await getNextDDTNumber(ddt.data);
  }

  if (editingIndex === null) {
    current.unshift(ddt);
  } else {
    current[editingIndex] = ddt;
  }

  await persistAndSync(current);
  resetFormState();
  render(current);
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

[clienteRiga1Input].forEach((input) => {
  input.addEventListener('input', () => clearSimpleFieldError(input));
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch((error) => {
    console.error('Service worker non registrato:', error);
  });
}

async function initApp() {
  const restore = await restoreFromDriveIfNeeded();
  if (restore.restored) {
    showSyncFeedback('Dati ripristinati da Drive');
  }

  resetFormState();
  render(getDDTs());

  window.addEventListener('online', async () => {
    const retry = await retryPendingBackup();
    if (retry.ok && !retry.skipped) {
      showSyncFeedback('DDT salvato in Drive');
    }
  });
}

initApp();
