function buildColorChoices(container, groupName) {
  const singleRow = document.createElement('div');
  singleRow.className = 'color-grid';
  const twoHeading = document.createElement('p');
  twoHeading.className = 'choice-group-title';
  twoHeading.textContent = 'Two colors';
  const twoRows = document.createElement('div');
  twoRows.className = 'color-grid two-colors';
  container.append(singleRow, twoHeading, twoRows);

  const options = [{ code: '', name: 'None', short: 'None', group: 'single', symbol: null }, ...MANA_COLORS];
  for (const option of options) {
    const choice = document.createElement('label');
    choice.className = 'color-choice';
    choice.title = option.name;

    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = groupName;
    radio.value = option.code;
    if (option.short !== option.name) radio.setAttribute('aria-label', `${option.name}, ${option.short}`);

    let picture;
    if (option.symbol) {
      picture = document.createElement('img');
      picture.src = option.symbol;
      picture.alt = '';
    } else {
      picture = document.createElement('span');
      picture.className = 'no-symbol';
    }
    picture.classList.add('choice-symbol');

    const label = document.createElement('span');
    label.className = 'choice-name';
    label.textContent = option.short;

    choice.append(radio, picture, label);
    (option.group === 'two' ? twoRows : singleRow).appendChild(choice);
  }
}

function buildCoverChoices(container, groupName) {
  for (const option of COVER_COLORS) {
    const choice = document.createElement('label');
    choice.className = 'color-choice';
    choice.title = option.name;

    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = groupName;
    radio.value = option.code;

    const swatch = document.createElement('span');
    swatch.className = `cover-swatch cover-${option.code}`;

    const label = document.createElement('span');
    label.className = 'choice-name';
    label.textContent = option.name;

    choice.append(radio, swatch, label);
    container.appendChild(choice);
  }
}

function showNameCount(input, counter) {
  counter.textContent = `${input.value.length} / ${input.maxLength}`;
}

function closeOnBackdropClick(dialog) {
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close('cancel');
  });
}

const newBinderDialog = document.getElementById('newBinderDialog');
const newBinderName   = document.getElementById('newBinderName');
const newNameCount    = document.getElementById('newNameCount');

let whenNewBinderCreated = null;

buildColorChoices(document.getElementById('colorChoices'), 'binderColor');
buildCoverChoices(document.getElementById('coverChoices'), 'binderCover');
newBinderName.addEventListener('input', () => showNameCount(newBinderName, newNameCount));

function openNewBinderDialog(onCreate) {
  whenNewBinderCreated = onCreate;
  newBinderName.value = nextBinderName();
  showNameCount(newBinderName, newNameCount);
  newBinderDialog.querySelector('input[name="binderColor"][value=""]').checked = true;
  newBinderDialog.querySelector(`input[name="binderCover"][value="${DEFAULT_COVER}"]`).checked = true;
  newBinderDialog.returnValue = '';
  newBinderDialog.showModal();
  newBinderName.select();
}

newBinderDialog.addEventListener('close', () => {
  const onCreate = whenNewBinderCreated;
  whenNewBinderCreated = null;
  if (newBinderDialog.returnValue !== 'create' || !onCreate) return;
  const picked = newBinderDialog.querySelector('input[name="binderColor"]:checked');
  const pickedCover = newBinderDialog.querySelector('input[name="binderCover"]:checked');
  const name = newBinderName.value.trim().slice(0, newBinderName.maxLength) || nextBinderName();
  onCreate(name, picked && picked.value ? picked.value : null, cleanCover(pickedCover && pickedCover.value));
});
closeOnBackdropClick(newBinderDialog);
