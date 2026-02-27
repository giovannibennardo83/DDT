const form = document.getElementById('ddt-form');
const list = document.getElementById('ddt-list');
const printLastButton = document.getElementById('print-last');

function formatItem(ddt) {
  return `${ddt.numero} - ${ddt.data} - ${ddt.cliente} (${ddt.articolo} x${ddt.quantita})`;
}

function render(ddts) {
  list.innerHTML = '';

  ddts.forEach((ddt, index) => {
    const li = document.createElement('li');
    li.textContent = formatItem(ddt);

    const printButton = document.createElement('button');
    printButton.textContent = 'Stampa';
    printButton.addEventListener('click', () => {
      localStorage.setItem('lastDDT', JSON.stringify(ddt));
      window.open('print.html', '_blank');
    });

    const deleteButton = document.createElement('button');
    deleteButton.textContent = 'Elimina';
    deleteButton.addEventListener('click', () => {
      const updated = getDDTs();
      updated.splice(index, 1);
      saveDDTs(updated);
      render(updated);
    });

    li.append(printButton, deleteButton);
    list.appendChild(li);
  });
}

form.addEventListener('submit', (event) => {
  event.preventDefault();

  const ddt = {
    numero: document.getElementById('numero').value.trim(),
    data: document.getElementById('data').value,
    cliente: document.getElementById('cliente').value.trim(),
    articolo: document.getElementById('articolo').value.trim(),
    quantita: Number(document.getElementById('quantita').value),
    createdAt: new Date().toISOString(),
  };

  const current = getDDTs();
  current.unshift(ddt);
  saveDDTs(current);
  localStorage.setItem('lastDDT', JSON.stringify(ddt));

  form.reset();
  render(current);
});

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

render(getDDTs());
