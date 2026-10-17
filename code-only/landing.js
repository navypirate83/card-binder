const root           = document.documentElement;
const themeSwitch    = document.getElementById('themeSwitch');
const signedOutView  = document.getElementById('signedOutView');
const signInButton   = document.getElementById('signInButton');
const skipLoginButton = document.getElementById('skipLoginButton');
const signInMessage  = document.getElementById('signInMessage');
const signedInView   = document.getElementById('signedInView');
const accountName    = document.getElementById('accountName');
const footerSignOut  = document.getElementById('footerSignOut');
const myBindersItem  = document.getElementById('myBindersItem');
const binderShelf    = document.getElementById('binderShelf');
const shelfMessage   = document.getElementById('shelfMessage');
const editBinderDialog   = document.getElementById('editBinderDialog');
const editColorChoices   = document.getElementById('editColorChoices');
const editCoverChoices   = document.getElementById('editCoverChoices');
const binderNameInput    = document.getElementById('binderNameInput');
const nameCount          = document.getElementById('nameCount');
const deleteBinderDialog = document.getElementById('deleteBinderDialog');
const deleteBinderText   = document.getElementById('deleteBinderText');
const editDropZone       = document.getElementById('editDropZone');
const deleteDropZone     = document.getElementById('deleteDropZone');
const binderPagesInput   = document.getElementById('binderPagesInput');
const pagesNote          = document.getElementById('pagesNote');

function setShelfMessage(text, isError = false) {
  shelfMessage.textContent = text;
  shelfMessage.classList.toggle('error', isError);
}

function cardCountText(count) {
  return `${count} card${count === 1 ? '' : 's'}`;
}

function setTheme(theme) {
  root.setAttribute('data-theme', theme);
  themeSwitch.setAttribute('aria-checked', String(theme === 'dark'));
  storageSet('theme', theme);
}

themeSwitch.addEventListener('click', () => {
  setTheme(root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
});

themeSwitch.setAttribute('aria-checked', String(root.getAttribute('data-theme') === 'dark'));

function showSignedOut(message = '') {
  signedInView.hidden = true;
  signedOutView.hidden = false;
  footerSignOut.hidden = true;
  myBindersItem.hidden = true;
  signInMessage.textContent = message;
  signInButton.disabled = false;
}

signInButton.addEventListener('click', async () => {
  signInMessage.textContent = '';
  signInButton.disabled = true;
  try {
    await signInWithGoogle();
    showSignedIn();
  } catch (err) {
    showSignedOut(err.message);
  }
});

skipLoginButton.addEventListener('click', () => {
  const leftover = loadBinderList();
  if (leftover.some((b) => binderDirtyStamp(b.id)) &&
      !confirm('This browser has binder changes that haven\'t been saved to Google Drive yet. ' +
               'Using the app locally will forget them. Continue?')) {
    return;
  }
  clearAllBinders();
  setLocalMode(true);
  showLocalOnly();
});

setUpFooterSignOut(() => showSignedOut('You\'re signed out.'), () => showSignedIn());

function showLocalOnly() {
  signedOutView.hidden = true;
  signedInView.hidden = false;
  myBindersItem.hidden = false;
  showFooterAccountLink();
  accountName.textContent = 'Saved on this device only';
  renderShelf(loadBinderList());
  setShelfMessage('');
}

async function showSignedIn() {
  signedOutView.hidden = true;
  signedInView.hidden = false;
  showFooterAccountLink();
  myBindersItem.hidden = false;
  renderShelf(loadBinderList());
  setShelfMessage('Loading your binders…');

  try {
    const user = await getDriveUser();
    accountName.textContent = `Signed in as ${user.displayName || user.emailAddress}`;

    const files = await listBinderFiles();
    let binders = files.map((file) => {
      const labels = file.appProperties || {};
      return {
        id: file.id,
        name: nameFromFileName(file.name),
        color: manaColor(labels.color) ? labels.color : null,
        cover: cleanCover(labels.cover),
        pages: cleanPageCount(labels.pages),
        order: labels.order !== undefined ? Number(labels.order) : null
      };
    });

    binders.sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));
    binders = binders.map(({ id, name, color, cover, pages }) => ({ id, name, color, cover, pages }));

    if (binders.length === 0) binders = await moveOldCardsIntoFirstBinder();

    saveBinderList(binders);
    await Promise.all(binders.map((b) => syncBinder(b.id)));

    renderShelf(binders);
    setShelfMessage('');
  } catch (err) {
    if (err.signedOut) {
      showSignedOut(err.message);
      return;
    }
    setShelfMessage(`Couldn't load your binders from Google Drive. ${err.message}`, true);
  }
}

async function moveOldCardsIntoFirstBinder() {
  let oldCards = {};
  try { oldCards = JSON.parse(storageGet(OLD_SINGLE_BINDER_KEY)) || {}; } catch (e) {  }
  const { cards } = cleanCards(oldCards);
  if (Object.keys(cards).length === 0) return [];

  const name = 'Binder 1';
  const file = await createBinderFile(name, cards);
  saveBinder(cards, file.id, { dirty: false });
  storageRemove(OLD_SINGLE_BINDER_KEY);
  return [{ id: file.id, name, color: null, cover: DEFAULT_COVER, pages: DEFAULT_PAGES }];
}

function renderShelf(binders) {
  binderShelf.replaceChildren();

  for (const binder of binders) {
    const count = Object.keys(loadBinder(binder.id)).length;
    const tile = document.createElement('a');
    tile.className = 'binder-tile';
    tile.href = `binder.html?binder=${encodeURIComponent(binder.id)}`;
    tile.dataset.id = binder.id;
    tile.draggable = false;
    const color = manaColor(binder.color);
    const colorWords = color ? `, ${color.name}` : '';
    const coverWords = `, ${coverColorName(binder.cover)} cover`;
    tile.setAttribute('aria-label', `Open ${binder.name}${coverWords}${colorWords}, ${cardCountText(count)}`);
    tile.append(closedBinder(binder.name, binder.color, binder.cover), caption(cardCountText(count)));
    binderShelf.appendChild(tile);
  }

  const addTile = document.createElement('button');
  addTile.type = 'button';
  addTile.id = 'addBinderTile';
  addTile.className = 'binder-tile';
  addTile.setAttribute('aria-label', 'Make a new binder');
  const cover = closedBinder(null, null);
  const plus = document.createElement('span');
  plus.className = 'cover-plus';
  plus.textContent = '+';
  cover.appendChild(plus);
  addTile.append(cover, caption('New binder'));
  addTile.addEventListener('click', () => openNewBinderDialog(makeNewBinder));
  binderShelf.appendChild(addTile);

  fitCoverLabels();
}

function fitCoverLabels() {
  for (const label of binderShelf.querySelectorAll('.cover-label')) {
    label.style.fontSize = '';
    let size = parseFloat(getComputedStyle(label).fontSize);
    while (nameTooWide(label) && size > 8) {
      size -= 0.5;
      label.style.fontSize = `${size}px`;
    }
  }
}

function nameTooWide(label) {
  const range = document.createRange();
  range.selectNodeContents(label);
  const textWidth = range.getBoundingClientRect().width;
  const style = getComputedStyle(label);
  const space = label.getBoundingClientRect().width
    - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
    - parseFloat(style.borderLeftWidth) - parseFloat(style.borderRightWidth);
  return textWidth > space;
}

window.addEventListener('resize', fitCoverLabels);

function closedBinder(name, colorCode, coverCode) {
  const cover = document.createElement('span');
  cover.className = 'closed-binder';
  applyCoverColor(cover, coverCode);
  if (name) {
    const label = document.createElement('span');
    label.className = 'cover-label';
    label.textContent = name;
    cover.appendChild(label);
  }
  const color = manaColor(colorCode);
  if (color) {
    const symbol = document.createElement('img');
    symbol.className = 'cover-symbol';
    symbol.src = color.symbol;
    symbol.alt = '';
    symbol.draggable = false;
    cover.appendChild(symbol);
  }
  return cover;
}

function caption(text) {
  const span = document.createElement('span');
  span.className = 'tile-caption';
  span.textContent = text;
  return span;
}

async function makeNewBinder(name, color, cover) {
  const binders = loadBinderList();
  const addTile = document.getElementById('addBinderTile');
  if (addTile) addTile.disabled = true;
  setShelfMessage('Making a new binder…');

  try {
    const file = await createBinderFile(name, {}, color, binders.length, cover);
    saveBinder({}, file.id, { dirty: false });
    binders.push({ id: file.id, name, color, cover, pages: DEFAULT_PAGES });
    saveBinderList(binders);
    renderShelf(binders);
    setShelfMessage('');
  } catch (err) {
    if (err.signedOut) {
      showSignedOut(err.message);
      return;
    }
    if (addTile) addTile.disabled = false;
    setShelfMessage(`Couldn't make a new binder. ${err.message}`, true);
  }
}

const DRAG_START_DISTANCE = 6;

const HOLD_TO_DRAG_MS = 350;
const HOLD_WOBBLE = 10;

const DROP_ZONE_REACH = 52;

let drag = null;

let pendingMouse = null;
let holdTimer = null;
let holdStart = null;
let lastDragEnd = 0;

function tileAt(x, y) {
  const element = document.elementFromPoint(x, y);
  const tile = element && element.closest('a.binder-tile');
  return tile && binderShelf.contains(tile) ? tile : null;
}

function overZone(zone, x, y) {
  const box = zone.getBoundingClientRect();
  if (box.width === 0) return false;
  return Math.hypot(x - (box.left + box.width / 2), y - (box.top + box.height / 2)) <= DROP_ZONE_REACH;
}

function beginDrag(tile, x, y) {
  const cover = tile.querySelector('.closed-binder');
  const box = cover.getBoundingClientRect();

  const ghost = document.createElement('div');
  ghost.className = 'binder-ghost';
  ghost.style.width = `${box.width}px`;
  ghost.style.height = `${box.height}px`;
  ghost.appendChild(cover.cloneNode(true));
  document.body.appendChild(ghost);

  drag = { id: tile.dataset.id, tile, ghost, grabX: x - box.left, grabY: y - box.top, target: null, zone: null };
  tile.classList.add('drag-source');
  document.body.classList.add('dragging');
  moveDrag(x, y);
}

function moveDrag(x, y) {
  if (!drag) return;
  drag.ghost.style.transform =
    `translate(${x - drag.grabX}px, ${y - drag.grabY}px) rotate(-3deg) scale(1.05)`;

  drag.zone = overZone(editDropZone, x, y) ? 'edit'
    : overZone(deleteDropZone, x, y) ? 'delete' : null;
  editDropZone.classList.toggle('active', drag.zone === 'edit');
  deleteDropZone.classList.toggle('active', drag.zone === 'delete');
  drag.ghost.classList.toggle('over-zone', drag.zone !== null);

  const target = drag.zone ? null : tileAt(x, y);
  const useful = target && target !== drag.tile ? target : null;
  if (useful !== drag.target) {
    if (drag.target) drag.target.classList.remove('drop-target');
    if (useful) useful.classList.add('drop-target');
    drag.target = useful;
  }
}

function endDrag(x, y) {
  if (!drag) return;
  moveDrag(x, y);
  const { id, zone, target } = drag;
  const targetId = target ? target.dataset.id : null;
  finishDrag();

  if (zone === 'delete') openDeleteDialog(id);
  else if (zone === 'edit') openEditDialog(id);
  else if (targetId) moveBinder(id, targetId);
}

function finishDrag() {
  if (!drag) return;
  drag.ghost.remove();
  drag.tile.classList.remove('drag-source');
  if (drag.target) drag.target.classList.remove('drop-target');
  editDropZone.classList.remove('active');
  deleteDropZone.classList.remove('active');
  document.body.classList.remove('dragging');
  drag = null;
  lastDragEnd = Date.now();
}

function moveBinder(id, targetId) {
  const binders = loadBinderList();
  const from = binders.findIndex((b) => b.id === id);
  const to = binders.findIndex((b) => b.id === targetId);
  if (from < 0 || to < 0) return;
  const [moving] = binders.splice(from, 1);
  binders.splice(to, 0, moving);
  saveBinderList(binders);
  renderShelf(binders);
  saveShelfOrder(binders);
}

async function saveShelfOrder(binders) {
  setShelfMessage('Saving the new order…');
  try {
    await Promise.all(binders.map((b, index) => updateBinderDetails(b.id, { order: index })));
    setShelfMessage('');
  } catch (err) {
    if (err.signedOut) { showSignedOut(err.message); return; }
    setShelfMessage(`Couldn't save the new order to Google Drive. ${err.message}`, true);
  }
}

binderShelf.addEventListener('pointerdown', (event) => {
  if (event.pointerType === 'touch' || event.button !== 0) return;
  const tile = event.target.closest('a.binder-tile');
  if (!tile) return;
  event.preventDefault();
  pendingMouse = { tile, x: event.clientX, y: event.clientY };
});

window.addEventListener('pointermove', (event) => {
  if (event.pointerType === 'touch') return;
  if (pendingMouse && Math.hypot(event.clientX - pendingMouse.x, event.clientY - pendingMouse.y) >= DRAG_START_DISTANCE) {
    beginDrag(pendingMouse.tile, pendingMouse.x, pendingMouse.y);
    pendingMouse = null;
  }
  moveDrag(event.clientX, event.clientY);
});

window.addEventListener('pointerup', (event) => {
  if (event.pointerType === 'touch') return;
  pendingMouse = null;
  endDrag(event.clientX, event.clientY);
});

binderShelf.addEventListener('touchstart', (event) => {
  if (event.touches.length !== 1) return;
  const tile = event.target.closest('a.binder-tile');
  if (!tile) return;
  const touch = event.touches[0];
  holdStart = { x: touch.clientX, y: touch.clientY };
  clearTimeout(holdTimer);
  holdTimer = setTimeout(() => {
    holdTimer = null;
    beginDrag(tile, holdStart.x, holdStart.y);
    if (navigator.vibrate) navigator.vibrate(15);
  }, HOLD_TO_DRAG_MS);
}, { passive: true });

binderShelf.addEventListener('touchmove', (event) => {
  const touch = event.touches[0];
  if (holdTimer && Math.hypot(touch.clientX - holdStart.x, touch.clientY - holdStart.y) > HOLD_WOBBLE) {
    clearTimeout(holdTimer);
    holdTimer = null;
  }
  if (drag) {
    event.preventDefault();
    moveDrag(touch.clientX, touch.clientY);
  }
}, { passive: false });

binderShelf.addEventListener('touchend', (event) => {
  clearTimeout(holdTimer);
  holdTimer = null;
  if (drag) {
    const touch = event.changedTouches[0];
    endDrag(touch.clientX, touch.clientY);
  }
});

binderShelf.addEventListener('touchcancel', () => {
  clearTimeout(holdTimer);
  holdTimer = null;
  finishDrag();
});

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') { pendingMouse = null; finishDrag(); }
});
window.addEventListener('blur', () => { pendingMouse = null; finishDrag(); });

binderShelf.addEventListener('click', (event) => {
  if (drag || Date.now() - lastDragEnd < 400) {
    event.preventDefault();
    event.stopPropagation();
  }
}, true);

binderShelf.addEventListener('contextmenu', (event) => {
  if (event.target.closest('a.binder-tile')) event.preventDefault();
});

function updatePagesNote() {
  const pages = Number(binderPagesInput.value);
  const min = Number(binderPagesInput.min);
  const range = `${min} to ${MAX_PAGES} pages`;
  let text;
  if (!Number.isInteger(pages) || pages < 1) text = `Enter a number (${range}).`;
  else if (pages < min) text = `Too few: its cards need at least ${min} page${min === 1 ? '' : 's'}.`;
  else if (pages > MAX_PAGES) text = `Too many: the most is ${MAX_PAGES} pages.`;
  else text = `Holds ${pages * POCKETS_PER_PAGE} cards · ${range}`;
  const ok = Number.isInteger(pages) && pages >= min && pages <= MAX_PAGES;
  pagesNote.textContent = text;
  pagesNote.classList.toggle('error', !ok);
}
binderPagesInput.addEventListener('input', updatePagesNote);

let editingId = null;

buildColorChoices(editColorChoices, 'editColor');
buildCoverChoices(editCoverChoices, 'editCover');

binderNameInput.addEventListener('input', () => showNameCount(binderNameInput, nameCount));

function openEditDialog(id) {
  const binder = loadBinderList().find((b) => b.id === id);
  if (!binder) return;
  editingId = id;
  binderNameInput.value = binder.name.slice(0, binderNameInput.maxLength);
  showNameCount(binderNameInput, nameCount);
  const cardCount = Object.keys(loadBinder(id)).length;
  binderPagesInput.min = minPagesFor(cardCount);
  binderPagesInput.max = MAX_PAGES;
  binderPagesInput.value = binderPages(id);
  updatePagesNote();
  editBinderDialog.querySelector(`input[name="editColor"][value="${binder.color || ''}"]`).checked = true;
  setPickedCoverColor(editCoverChoices, binder.cover);
  editBinderDialog.returnValue = '';
  editBinderDialog.showModal();
  binderNameInput.select();
}

editBinderDialog.addEventListener('close', async () => {
  const id = editingId;
  editingId = null;
  if (editBinderDialog.returnValue !== 'save' || !id) return;
  const name = binderNameInput.value.trim().slice(0, binderNameInput.maxLength);
  if (!name) return;
  const picked = editBinderDialog.querySelector('input[name="editColor"]:checked');
  const color = picked && picked.value ? picked.value : null;
  const cover = pickedCoverColor(editCoverChoices);
  let pages = Math.max(cleanPageCount(binderPagesInput.value), Number(binderPagesInput.min));
  const oldPages = binderPages(id);

  const binders = loadBinderList();
  const binder = binders.find((b) => b.id === id);
  if (!binder) return;
  binder.name = name;
  binder.color = color;
  binder.cover = cover;
  binder.pages = pages;
  saveBinderList(binders);
  renderShelf(binders);

  setShelfMessage('Saving…');
  try {
    if (pages < oldPages) {
      const cards = await syncBinder(id);
      const needed = minPagesFor(Object.keys(cards).length);
      if (pages < needed) {
        pages = needed;
        binder.pages = pages;
        saveBinderList(binders);
        renderShelf(binders);
      }
      const fitted = fitCardsIntoPages(cards, pages);
      if (JSON.stringify(fitted) !== JSON.stringify(cards)) {
        saveBinder(fitted, id);
        await syncBinder(id);
      }
    }
    await updateBinderDetails(id, { name, color, cover, pages });
    setShelfMessage('');
  } catch (err) {
    if (err.signedOut) { showSignedOut(err.message); return; }
    setShelfMessage(`Couldn't save the changes to Google Drive. ${err.message}`, true);
  }
});
closeOnBackdropClick(editBinderDialog);

let deletingId = null;

function openDeleteDialog(id) {
  const binder = loadBinderList().find((b) => b.id === id);
  if (!binder) return;
  deletingId = id;
  const count = Object.keys(loadBinder(id)).length;
  deleteBinderText.textContent =
    `"${binder.name}" and its ${cardCountText(count)} will be deleted. ` +
    (isLocalMode()
      ? 'It\'s only saved on this device, so it can\'t be brought back.'
      : 'It goes to your Google Drive trash, where it can be restored for 30 days.');
  deleteBinderDialog.returnValue = '';
  deleteBinderDialog.showModal();
}

deleteBinderDialog.addEventListener('close', async () => {
  const id = deletingId;
  deletingId = null;
  if (deleteBinderDialog.returnValue !== 'yes' || !id) return;
  setShelfMessage('Deleting…');
  try {
    await trashBinderFile(id);
    forgetBinder(id);
    renderShelf(loadBinderList());
    setShelfMessage('');
  } catch (err) {
    if (err.signedOut) { showSignedOut(err.message); return; }
    setShelfMessage(`Couldn't delete the binder. ${err.message}`, true);
  }
});
closeOnBackdropClick(deleteBinderDialog);

initGoogleSignIn().catch((err) => {
  if (signedOutView.hidden === false) signInMessage.textContent = err.message;
});

if (isLocalMode()) {
  showLocalOnly();
} else if (isSignedIn()) {
  showSignedIn();
} else if (!googleIsConfigured()) {
  showSignedOut('Google sign-in isn\'t set up yet: the Google Client ID still needs to be added to google-drive.js.');
  signInButton.disabled = true;
} else {
  showSignedOut();
}
