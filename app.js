const form = document.getElementById('ddt-form');
const list = document.getElementById('ddt-list');
const printLastButton = document.getElementById('print-last');
const addRowButton = document.getElementById('add-row');
const righeContainer = document.getElementById('righe-container');
const cancelEditButton = document.getElementById('cancel-edit');
const formTitle = document.getElementById('form-title');

let editingIndex = null;

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
  return `${ddt.numero} - ${ddt.data} - ${ddt.cliente} (${formatRows(ddt.righe)})`;
}

function renderRow(riga = createEmptyRiga()) {
  const row = document.createElement('div');
  row.className = 'riga-row';
  row.innerHTML = `
    <div class="table-label">Codice articolo</div>
    <div class="field-with-actions">
      <input type="text" class="codice_articolo" value="${riga.codice_articolo}" placeholder="Codice articolo" />
      <div class="inline-actions">
        <button type="button" class="scan-button" data-scan-target="codice_articolo">Scan Codice</button>
      </div>
      <small class="error-message"></small>
    </div>

    <div class="table-label">Lotto</div>
    <div class="field-with-actions">
      <input type="text" class="lotto" value="${riga.lotto}" placeholder="Lotto" />
      <div class="inline-actions">
        <button type="button" class="scan-button" data-scan-target="lotto">Scan Lotto</button>
      </div>
      <small class="error-message"></small>
    </div>

    <div class="table-label">Quantità</div>
    <div class="field-with-actions">
      <input type="number" class="quantita" value="${riga.quantita}" min="1" placeholder="Quantità" />
      <div class="inline-actions">
        <button type="button" class="danger remove-row">Rimuovi</button>
      </div>
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

  row.querySelectorAll('.scan-button').forEach((button) => {
    button.addEventListener('click', async () => {
      const target = button.dataset.scanTarget;
      const input = row.querySelector(`.${target}`);
      const scanned = await tryScanValue();
      if (scanned) {
        input.value = scanned;
        clearFieldError(input);
      }
    });
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
      setFieldError(codice, 'Inserisci il codice.');
      valid = false;
    }

    if (!normalized.lotto) {
      setFieldError(lotto, 'Inserisci il lotto.');
      valid = false;
    }

    if (!Number.isFinite(normalized.quantita) || normalized.quantita < 1) {
      setFieldError(quantita, 'Quantità minima: 1.');
      valid = false;
    }

    result.push(normalized);
  });

  return { valid, righe: result };
}

async function tryScanValue() {
  if (!navigator.mediaDevices?.getUserMedia || typeof BarcodeDetector === 'undefined') {
    return window.prompt('Camera non disponibile. Inserisci valore manualmente:')?.trim();
  }

  const detector = new BarcodeDetector({ formats: ['qr_code', 'code_128', 'ean_13', 'ean_8'] });
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
  const video = document.createElement('video');
  video.srcObject = stream;
  video.setAttribute('playsinline', 'true');
  await video.play();

  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth || 1280;
  canvas.height = video.videoHeight || 720;
  const context = canvas.getContext('2d');

  try {
    for (let i = 0; i < 30; i += 1) {
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const barcodes = await detector.detect(canvas);
      if (barcodes.length > 0 && barcodes[0].rawValue) {
        return barcodes[0].rawValue.trim();
      }
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
  } finally {
    stream.getTracks().forEach((track) => track.stop());
  }

  return window.prompt('Nessun codice rilevato. Inserisci valore manualmente:')?.trim();
}

function resetFormState() {
  editingIndex = null;
  formTitle.textContent = 'Nuovo DDT';
  cancelEditButton.hidden = true;
  form.reset();
  righeContainer.innerHTML = '';
  addRiga();
}

function loadInForm(ddt, index) {
  editingIndex = index;
  formTitle.textContent = `Modifica DDT ${ddt.numero}`;
  cancelEditButton.hidden = false;
  document.getElementById('numero').value = ddt.numero;
  document.getElementById('data').value = ddt.data;
  document.getElementById('cliente').value = ddt.cliente;

  righeContainer.innerHTML = '';
  ddt.righe.forEach((riga) => renderRow(normalizeRiga(riga)));
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
    printButton.addEventListener('click', () => {
      localStorage.setItem('lastDDT', JSON.stringify(ddt));
      window.open('print.html', '_blank');
    });

    const deleteButton = document.createElement('button');
    deleteButton.textContent = 'Elimina';
    deleteButton.className = 'danger';
    deleteButton.addEventListener('click', () => {
      const updated = getDDTs();
      updated.splice(index, 1);
      saveDDTs(updated);
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

form.addEventListener('submit', (event) => {
  event.preventDefault();

  const { valid, righe } = extractAndValidateRighe();
  if (!valid) {
    return;
  }

  const ddt = {
    numero: document.getElementById('numero').value.trim(),
    data: document.getElementById('data').value,
    cliente: document.getElementById('cliente').value.trim(),
    righe,
    createdAt: new Date().toISOString(),
  };

  const current = getDDTs();
  if (editingIndex === null) {
    current.unshift(ddt);
  } else {
    ddt.createdAt = current[editingIndex].createdAt || ddt.createdAt;
    current[editingIndex] = ddt;
  }

  saveDDTs(current);
  localStorage.setItem('lastDDT', JSON.stringify(ddt));
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

  localStorage.setItem('lastDDT', JSON.stringify(all[0]));
  window.open('print.html', '_blank');
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch((error) => {
    console.error('Service worker non registrato:', error);
  });
}

resetFormState();
render(getDDTs());
