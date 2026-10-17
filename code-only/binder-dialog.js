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

function applyCoverColor(element, code) {
  code = cleanCover(code);
  for (const name of [...element.classList]) {
    if (name.startsWith('cover-') && name !== 'cover-swatch') element.classList.remove(name);
  }
  for (const shade of ['--cover-light', '--cover-base', '--cover-dark', '--cover-edge']) {
    element.style.removeProperty(shade);
  }

  let light;
  if (isCustomCover(code)) {
    element.style.setProperty('--cover-light', mixColors(code, '#ffffff', 0.25));
    element.style.setProperty('--cover-base', code);
    element.style.setProperty('--cover-dark', mixColors(code, '#000000', 0.45));
    element.style.setProperty('--cover-edge', mixColors(code, '#000000', 0.2));
    light = brightness(code) > 0.6;
  } else {
    element.classList.add(`cover-${code}`);
    light = COVER_COLORS.find((c) => c.code === code).light === true;
  }
  element.classList.toggle('light-cover', light);
}

function coverColorName(code) {
  code = cleanCover(code);
  return isCustomCover(code) ? 'Custom color' : COVER_COLORS.find((c) => c.code === code).name;
}

function colorParts(hex) {
  return [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16));
}

function mixColors(hex, towards, amount) {
  const from = colorParts(hex);
  const to = colorParts(towards);
  return '#' + from.map((value, i) => {
    const mixed = Math.round(value + (to[i] - value) * amount);
    return mixed.toString(16).padStart(2, '0');
  }).join('');
}

function brightness(hex) {
  const [r, g, b] = colorParts(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
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
    swatch.className = 'cover-swatch';
    applyCoverColor(swatch, option.code);

    const label = document.createElement('span');
    label.className = 'choice-name';
    label.textContent = option.name;

    choice.append(radio, swatch, label);
    container.appendChild(choice);
  }

  const choice = document.createElement('label');
  choice.className = 'color-choice custom-cover-choice';
  choice.title = 'Pick any color';

  const radio = document.createElement('input');
  radio.type = 'radio';
  radio.name = groupName;
  radio.value = 'custom';
  radio.setAttribute('aria-label', 'Custom color (opens a color chooser)');

  const swatch = document.createElement('span');
  swatch.className = 'cover-swatch custom-unset';

  const chooser = document.createElement('input');
  chooser.type = 'color';
  chooser.className = 'custom-cover-input';
  chooser.tabIndex = -1;
  chooser.setAttribute('aria-hidden', 'true');
  chooser.value = '#7a4fb3';

  const label = document.createElement('span');
  label.className = 'choice-name';
  label.textContent = 'Custom';

  radio.addEventListener('click', () => {
    try { chooser.showPicker(); } catch (e) { chooser.click(); }
  });
  chooser.addEventListener('input', () => {
    swatch.classList.remove('custom-unset');
    applyCoverColor(swatch, chooser.value);
    radio.checked = true;
  });

  choice.append(radio, swatch, chooser, label);
  container.appendChild(choice);
}

function pickedCoverColor(container) {
  const picked = container.querySelector('input[type="radio"]:checked');
  if (!picked) return DEFAULT_COVER;
  if (picked.value === 'custom') return cleanCover(container.querySelector('.custom-cover-input').value);
  return cleanCover(picked.value);
}

function setPickedCoverColor(container, code) {
  code = cleanCover(code);
  const customSwatch = container.querySelector('.custom-cover-choice .cover-swatch');
  const chooser = container.querySelector('.custom-cover-input');
  if (isCustomCover(code)) {
    chooser.value = code;
    customSwatch.classList.remove('custom-unset');
    applyCoverColor(customSwatch, code);
    container.querySelector('input[value="custom"]').checked = true;
  } else {
    applyCoverColor(customSwatch, DEFAULT_COVER);
    customSwatch.classList.remove('cover-black');
    customSwatch.classList.add('custom-unset');
    container.querySelector(`input[type="radio"][value="${code}"]`).checked = true;
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
const coverChoices    = document.getElementById('coverChoices');
const newBinderName   = document.getElementById('newBinderName');
const newNameCount    = document.getElementById('newNameCount');

let whenNewBinderCreated = null;

buildColorChoices(document.getElementById('colorChoices'), 'binderColor');
buildCoverChoices(coverChoices, 'binderCover');
newBinderName.addEventListener('input', () => showNameCount(newBinderName, newNameCount));

function openNewBinderDialog(onCreate) {
  whenNewBinderCreated = onCreate;
  newBinderName.value = nextBinderName();
  showNameCount(newBinderName, newNameCount);
  newBinderDialog.querySelector('input[name="binderColor"][value=""]').checked = true;
  setPickedCoverColor(coverChoices, DEFAULT_COVER);
  newBinderDialog.returnValue = '';
  newBinderDialog.showModal();
  newBinderName.select();
}

newBinderDialog.addEventListener('close', () => {
  const onCreate = whenNewBinderCreated;
  whenNewBinderCreated = null;
  if (newBinderDialog.returnValue !== 'create' || !onCreate) return;
  const picked = newBinderDialog.querySelector('input[name="binderColor"]:checked');
  const name = newBinderName.value.trim().slice(0, newBinderName.maxLength) || nextBinderName();
  onCreate(name, picked && picked.value ? picked.value : null, pickedCoverColor(coverChoices));
});
closeOnBackdropClick(newBinderDialog);
