const root        = document.documentElement;
const themeSwitch = document.getElementById('themeSwitch');
const binder      = document.getElementById('binder');
const prevButton  = document.getElementById('prevPage');
const nextButton  = document.getElementById('nextPage');
const pageStatus  = document.getElementById('pageStatus');
const downloadButton = document.getElementById('downloadJson');
const uploadButton   = document.getElementById('uploadJson');
const fileInput      = document.getElementById('jsonFileInput');
const syncStatus     = document.getElementById('syncStatus');
const syncConnect    = document.getElementById('syncConnect');

const BINDER_ID = currentBinderId();
if (!BINDER_ID) location.replace('index.html');

storageSet(LAST_BINDER_KEY, BINDER_ID || '');
document.title = `${binderName(BINDER_ID)} – MTG Card Binder`;
document.getElementById('thisBinderLink').textContent = binderName(BINDER_ID);
document.getElementById('thisBinderLink').href = `binder.html?binder=${encodeURIComponent(BINDER_ID)}`;
document.getElementById('cardSearchLink').href = `cardsearch.html?binder=${encodeURIComponent(BINDER_ID)}`;

function setTheme(theme) {
  root.setAttribute('data-theme', theme);
  themeSwitch.setAttribute('aria-checked', String(theme === 'dark'));
  try { localStorage.setItem('theme', theme); } catch (e) {  }
}

themeSwitch.addEventListener('click', () => {
  setTheme(root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
});

themeSwitch.setAttribute('aria-checked', String(root.getAttribute('data-theme') === 'dark'));

const binderCards = loadBinder(BINDER_ID);

function searchLinkFor(page, slot, card) {
  const params = new URLSearchParams();
  if (card) {
    params.set('set', card.set);
    params.set('number', card.number);
    if (card.face === 1) params.set('face', 'back');
    if (card.lang) params.set('lang', card.lang);
  }
  params.set('binder', BINDER_ID);
  params.set('binderPage', page);
  params.set('binderSlot', slot);
  return `cardsearch.html?${params}`;
}

function fillPocket(pocket, page, slot) {
  const card = binderCards[pocketKey(page, slot)];
  const link = document.createElement('a');
  link.href = searchLinkFor(page, slot, card);

  if (card) {
    link.className = 'pocket-card';
    link.setAttribute('aria-label', `${card.name}, pocket ${slot}. Open in card search`);
    const img = document.createElement('img');
    img.src = card.image;
    img.alt = '';
    img.loading = 'eager';
    img.draggable = false;
    link.draggable = false;
    link.appendChild(img);
  } else {
    link.className = 'pocket-add';
    link.setAttribute('aria-label', `Add a card to pocket ${slot}`);
    link.textContent = '+';
  }

  pocket.appendChild(link);
}

function buildPages() {
  for (let pageNumber = 1; pageNumber <= TOTAL_PAGES; pageNumber++) {
    const page = document.createElement('div');
    page.className = 'binder-page';
    page.dataset.page = pageNumber;
    page.setAttribute('aria-label', `Page ${pageNumber}`);

    for (let slot = 1; slot <= POCKETS_PER_PAGE; slot++) {
      const pocket = document.createElement('div');
      pocket.className = 'pocket';
      pocket.dataset.page = pageNumber;
      pocket.dataset.slot = slot;
      fillPocket(pocket, pageNumber, slot);
      page.appendChild(pocket);
    }

    binder.appendChild(page);
  }
}

buildPages();

const PHONE_QUERY = window.matchMedia('(max-width: 640px)');

let currentPage = 1;

function pagesShown() {
  return PHONE_QUERY.matches ? 1 : 2;
}

function showPages() {
  const count = pagesShown();

  if (count === 2 && currentPage % 2 === 0) currentPage--;

  const lastShown = Math.min(currentPage + count - 1, TOTAL_PAGES);

  const numbers = [];
  for (let n = currentPage; n <= lastShown; n++) numbers.push(n);
  showOnly(numbers);

  pageStatus.textContent = currentPage === lastShown
    ? `Page ${currentPage} of ${TOTAL_PAGES}`
    : `Pages ${currentPage}–${lastShown} of ${TOTAL_PAGES}`;

  prevButton.disabled = currentPage <= 1;
  nextButton.disabled = lastShown >= TOTAL_PAGES;
}

function pageElement(number) {
  return binder.querySelector(`.binder-page[data-page="${number}"]`);
}

function showOnly(numbers) {
  binder.querySelectorAll('.binder-page').forEach((page) => {
    page.hidden = !numbers.includes(Number(page.dataset.page));
  });
}

const TURN_MS = 650;

let turning = false;

const REDUCE_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)');

function pageCopy(number) {
  const original = number ? pageElement(number) : null;
  if (!original) {
    const blank = document.createElement('div');
    blank.className = 'blank-page';
    return blank;
  }
  const copy = original.cloneNode(true);
  copy.hidden = false;
  copy.removeAttribute('aria-label');
  return copy;
}

function flipFace(sideClass, content) {
  const face = document.createElement('div');
  face.className = `flip-face ${sideClass}`;
  const shade = document.createElement('div');
  shade.className = 'flip-shade';
  face.append(content, shade);
  return face;
}

function castShadow(spot, spineSide) {
  const shadow = document.createElement('div');
  shadow.className = 'turn-shadow';
  Object.assign(shadow.style, {
    left: `${spot.left}px`, top: `${spot.top}px`,
    width: `${spot.width}px`, height: `${spot.height}px`,
    background: `linear-gradient(to ${spineSide === 'left' ? 'right' : 'left'},
      rgba(0, 0, 0, 0.6), rgba(0, 0, 0, 0.25) 35%, rgba(0, 0, 0, 0) 75%)`
  });
  binder.appendChild(shadow);
  return shadow;
}

function spotOf(element) {
  return {
    left: element.offsetLeft, top: element.offsetTop,
    width: element.offsetWidth, height: element.offsetHeight
  };
}

async function finishedOrForced(animation, duration) {
  const timeUp = new Promise((resolve) => setTimeout(resolve, duration + 500));
  await Promise.race([animation.finished, timeUp]);
  if (animation.playState !== 'finished') {
    for (const other of binder.getAnimations({ subtree: true })) {
      try { other.finish(); } catch (e) {  }
    }
  }
}

async function animateTurn({ cover, front, back, under, hinge, from, to, landing, fade, done }) {
  const spot = spotOf(cover);
  const otherSide = hinge === 'left' ? 'right' : 'left';

  const flipper = document.createElement('div');
  flipper.className = 'flipper';
  flipper.setAttribute('aria-hidden', 'true');
  Object.assign(flipper.style, {
    left: `${spot.left}px`, top: `${spot.top}px`,
    width: `${spot.width}px`, height: `${spot.height}px`,
    transformOrigin: `${hinge} center`
  });
  const frontFace = flipFace('flip-front', pageCopy(front));
  const backFace = flipFace('flip-back', pageCopy(back));
  flipper.append(frontFace, backFace);

  const startsOnBack = Math.abs(from) > 90;
  frontFace.hidden = startsOnBack;
  backFace.hidden = !startsOnBack;

  const startShadow = from === 0 ? castShadow(spot, hinge)
    : landing ? castShadow(spotOf(landing), otherSide) : null;
  const endShadow = to === 0 ? castShadow(spot, hinge)
    : landing ? castShadow(spotOf(landing), otherSide) : null;
  if (endShadow) endShadow.style.opacity = 0;

  showOnly(under);
  binder.appendChild(flipper);

  const half = TURN_MS / 2;
  const middle = (from + to) / 2;

  const lift = flipper.animate([
    { transform: `rotateY(${from}deg)`, opacity: fade === 'in' ? 0 : 1 },
    { transform: `rotateY(${middle}deg)`, opacity: 1 }
  ], { duration: half, easing: 'ease-in', fill: 'forwards' });
  (startsOnBack ? backFace : frontFace).lastChild.animate(
    [{ opacity: 0 }, { opacity: 0.5 }], { duration: half, easing: 'ease-in', fill: 'forwards' });
  if (startShadow) {
    startShadow.animate([{ opacity: 1 }, { opacity: 0 }],
      { duration: half, easing: 'ease-in', fill: 'forwards' });
  }
  await finishedOrForced(lift, half);

  frontFace.hidden = !startsOnBack;
  backFace.hidden = startsOnBack;

  const settle = flipper.animate([
    { transform: `rotateY(${middle}deg)`, opacity: 1 },
    { transform: `rotateY(${to}deg)`, opacity: fade === 'out' ? 0 : 1 }
  ], { duration: half, easing: 'ease-out', fill: 'forwards' });
  (startsOnBack ? frontFace : backFace).lastChild.animate(
    [{ opacity: 0.5 }, { opacity: 0 }], { duration: half, easing: 'ease-out', fill: 'forwards' });
  if (endShadow) {
    endShadow.animate([{ opacity: 0 }, { opacity: 1 }],
      { duration: half, easing: 'ease-out', fill: 'forwards' });
  }
  await finishedOrForced(settle, half);

  flipper.remove();
  if (startShadow) startShadow.remove();
  if (endShadow) endShadow.remove();
  done();
}

function turnPage(direction) {
  if (turning) return;
  const count = pagesShown();
  const from = currentPage;
  const target = currentPage + count * direction;
  if (target < 1 || target > TOTAL_PAGES) return;

  const finish = () => {
    currentPage = target;
    showPages();
    turning = false;
  };

  if (REDUCE_MOTION.matches || !pageElement(from) || !binder.animate) {
    finish();
    return;
  }
  turning = true;

  if (count === 2 && direction === 1) {
    const rightPage = pageElement(from + 1);
    if (!rightPage) { finish(); return; }
    animateTurn({
      cover: rightPage, front: from + 1, back: target,
      under: [from, target + 1], hinge: 'left', from: 0, to: -180,
      landing: pageElement(from), done: finish
    });
  } else if (count === 2) {
    animateTurn({
      cover: pageElement(from), front: from, back: target + 1,
      under: [target, from + 1], hinge: 'right', from: 0, to: 180,
      landing: pageElement(from + 1), done: finish
    });
  } else if (direction === 1) {
    animateTurn({
      cover: pageElement(from), front: from, back: null,
      under: [target], hinge: 'left', from: 0, to: -180, fade: 'out',
      done: finish
    });
  } else {
    animateTurn({
      cover: pageElement(from), front: target, back: null,
      under: [from], hinge: 'left', from: -180, to: 0, fade: 'in',
      done: finish
    });
  }
}

prevButton.addEventListener('click', () => turnPage(-1));
nextButton.addEventListener('click', () => turnPage(1));

PHONE_QUERY.addEventListener('change', showPages);

const SWIPE_DISTANCE = 50;

let touchStartX = 0;
let touchStartY = 0;

binder.addEventListener('touchstart', (event) => {
  touchStartX = event.touches[0].clientX;
  touchStartY = event.touches[0].clientY;
}, { passive: true });

binder.addEventListener('touchend', (event) => {
  if (!PHONE_QUERY.matches) return;
  if (drag) return;
  const moveX = event.changedTouches[0].clientX - touchStartX;
  const moveY = event.changedTouches[0].clientY - touchStartY;
  if (Math.abs(moveX) < SWIPE_DISTANCE || Math.abs(moveX) < Math.abs(moveY)) return;
  turnPage(moveX < 0 ? 1 : -1);
});

const DRAG_START_DISTANCE = 6;

const HOLD_TO_DRAG_MS = 350;

const HOLD_WOBBLE = 10;

const EDGE_ZONE = 18;

const EDGE_WAIT_MS = 550;

const trash = document.getElementById('binderTrash');
const TRASH_REACH = 44;

let drag = null;

let pendingMouse = null;

let holdTimer = null;
let holdStart = null;

let edgeTimer = null;

let lastDragEnd = 0;

function pocketElement(key) {
  const [page, slot] = key.split('-');
  return binder.querySelector(`.pocket[data-page="${page}"][data-slot="${slot}"]`);
}

function keyOf(pocket) {
  return pocketKey(pocket.dataset.page, pocket.dataset.slot);
}

function refreshPocket(key) {
  const pocket = pocketElement(key);
  if (!pocket) return;
  pocket.replaceChildren();
  fillPocket(pocket, Number(pocket.dataset.page), Number(pocket.dataset.slot));
}

function pocketAt(x, y) {
  const element = document.elementFromPoint(x, y);
  const pocket = element && element.closest('.pocket');
  return pocket && !pocket.closest('.flipper') && binder.contains(pocket) ? pocket : null;
}

function beginDrag(pocket, x, y) {
  const card = binderCards[keyOf(pocket)];
  if (!card) return;

  const box = pocket.getBoundingClientRect();
  const ghost = document.createElement('div');
  ghost.className = 'drag-ghost';
  ghost.style.width = `${box.width}px`;
  ghost.style.height = `${box.height}px`;
  const img = document.createElement('img');
  img.src = card.image;
  img.alt = '';
  ghost.appendChild(img);
  document.body.appendChild(ghost);

  drag = {
    fromKey: keyOf(pocket),
    ghost,
    grabX: x - box.left,
    grabY: y - box.top,
    target: null,
    overTrash: false,
    edge: 0
  };

  pocket.classList.add('drag-source');
  document.body.classList.add('dragging');
  moveDrag(x, y);
}

function moveDrag(x, y) {
  if (!drag) return;
  drag.ghost.style.transform =
    `translate(${x - drag.grabX}px, ${y - drag.grabY}px) rotate(3deg) scale(1.06)`;

  drag.overTrash = isOverTrash(x, y);
  trash.classList.toggle('active', drag.overTrash);
  drag.ghost.classList.toggle('over-trash', drag.overTrash);

  const target = drag.overTrash ? null : pocketAt(x, y);
  if (target !== drag.target) {
    if (drag.target) drag.target.classList.remove('drop-target');
    if (target && keyOf(target) !== drag.fromKey) target.classList.add('drop-target');
    drag.target = target;
  }

  const box = binder.getBoundingClientRect();
  const nearHeight = y > box.top - 40 && y < box.bottom + 40;
  let edge = 0;
  if (nearHeight && x < box.left + EDGE_ZONE) edge = -1;
  if (nearHeight && x > box.right - EDGE_ZONE) edge = 1;
  setEdge(edge);
}

function setEdge(edge) {
  if (edge === drag.edge) return;
  drag.edge = edge;
  binder.classList.toggle('edge-left', edge === -1);
  binder.classList.toggle('edge-right', edge === 1);
  clearTimeout(edgeTimer);
  if (edge !== 0) edgeTimer = setTimeout(turnFromEdge, EDGE_WAIT_MS);
}

function turnFromEdge() {
  if (!drag || drag.edge === 0) return;
  turnPage(drag.edge);
  edgeTimer = setTimeout(turnFromEdge, TURN_MS + EDGE_WAIT_MS);
}

function isOverTrash(x, y) {
  const box = trash.getBoundingClientRect();
  if (box.width === 0) return false;
  const centerX = box.left + box.width / 2;
  const centerY = box.top + box.height / 2;
  return Math.hypot(x - centerX, y - centerY) <= TRASH_REACH;
}

function endDrag(x, y) {
  if (!drag) return;
  const removing = isOverTrash(x, y);
  const target = removing ? null : pocketAt(x, y);
  const fromKey = drag.fromKey;
  const toKey = target ? keyOf(target) : null;
  finishDrag();

  if (removing) {
    const removed = binderCards[fromKey];
    delete binderCards[fromKey];
    if (!saveBinder(binderCards)) {
      binderCards[fromKey] = removed;
      alert('Your browser blocked saving, so the card could not be removed.');
      return;
    }
    refreshPocket(fromKey);
    scheduleDriveSave();
    return;
  }

  if (!toKey || toKey === fromKey) return;

  const moving = binderCards[fromKey];
  const swapped = binderCards[toKey];
  binderCards[toKey] = moving;
  if (swapped) binderCards[fromKey] = swapped;
  else delete binderCards[fromKey];

  if (!saveBinder(binderCards)) {
    binderCards[fromKey] = moving;
    if (swapped) binderCards[toKey] = swapped;
    else delete binderCards[toKey];
    alert('Your browser blocked saving, so the card could not be moved.');
    return;
  }
  refreshPocket(fromKey);
  refreshPocket(toKey);
  scheduleDriveSave();
}

function finishDrag() {
  if (!drag) return;
  drag.ghost.remove();
  if (drag.target) drag.target.classList.remove('drop-target');
  trash.classList.remove('active');
  const source = pocketElement(drag.fromKey);
  if (source) source.classList.remove('drag-source');
  clearTimeout(edgeTimer);
  binder.classList.remove('edge-left', 'edge-right');
  document.body.classList.remove('dragging');
  drag = null;
  lastDragEnd = Date.now();
}

binder.addEventListener('pointerdown', (event) => {
  if (event.pointerType === 'touch' || event.button !== 0) return;
  const pocket = event.target.closest('.pocket');
  if (!pocket || !binderCards[keyOf(pocket)] || turning) return;
  event.preventDefault();
  pendingMouse = { pocket, x: event.clientX, y: event.clientY };
});

window.addEventListener('pointermove', (event) => {
  if (event.pointerType === 'touch') return;
  if (pendingMouse) {
    const moved = Math.hypot(event.clientX - pendingMouse.x, event.clientY - pendingMouse.y);
    if (moved >= DRAG_START_DISTANCE) {
      beginDrag(pendingMouse.pocket, pendingMouse.x, pendingMouse.y);
      pendingMouse = null;
    }
  }
  moveDrag(event.clientX, event.clientY);
});

window.addEventListener('pointerup', (event) => {
  if (event.pointerType === 'touch') return;
  pendingMouse = null;
  endDrag(event.clientX, event.clientY);
});

binder.addEventListener('touchstart', (event) => {
  if (event.touches.length !== 1 || turning) return;
  const pocket = event.target.closest('.pocket');
  if (!pocket || !binderCards[keyOf(pocket)]) return;
  const touch = event.touches[0];
  holdStart = { x: touch.clientX, y: touch.clientY };
  clearTimeout(holdTimer);
  holdTimer = setTimeout(() => {
    holdTimer = null;
    beginDrag(pocket, holdStart.x, holdStart.y);
    if (navigator.vibrate) navigator.vibrate(15);
  }, HOLD_TO_DRAG_MS);
}, { passive: true });

binder.addEventListener('touchmove', (event) => {
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

binder.addEventListener('touchend', (event) => {
  clearTimeout(holdTimer);
  holdTimer = null;
  if (drag) {
    const touch = event.changedTouches[0];
    endDrag(touch.clientX, touch.clientY);
  }
});

binder.addEventListener('touchcancel', () => {
  clearTimeout(holdTimer);
  holdTimer = null;
  finishDrag();
});

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    pendingMouse = null;
    finishDrag();
  }
});

window.addEventListener('blur', () => {
  pendingMouse = null;
  finishDrag();
});

binder.addEventListener('click', (event) => {
  if (drag || Date.now() - lastDragEnd < 400) {
    event.preventDefault();
    event.stopPropagation();
  }
}, true);

binder.addEventListener('contextmenu', (event) => {
  if (event.target.closest('.pocket-card')) event.preventDefault();
});

const startPage = parseInt(new URLSearchParams(location.search).get('page'), 10);
if (startPage >= 1 && startPage <= TOTAL_PAGES) currentPage = startPage;
showPages();

downloadButton.addEventListener('click', () => {
  const data = binderFileData(BINDER_ID);
  const file = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(file);
  const safeName = binderName(BINDER_ID).replace(/[\\/:*?"<>|]/g, '');
  link.download = `${safeName} ${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);   // free the memory the file was using
});

// UPLOAD: the Upload button opens the (hidden) file picker.
uploadButton.addEventListener('click', () => fileInput.click());

// Read a chosen file, check it, and put its cards into the binder.
fileInput.addEventListener('change', async () => {
  const chosen = fileInput.files[0];
  fileInput.value = '';             // so picking the same file again still works
  if (!chosen) return;              // the picker was closed without a file

  // Read the file's text and turn it back into data.
  let data;
  try {
    data = JSON.parse(await chosen.text());
  } catch (e) {
    alert('That file isn\'t a readable .JSON file.');
    return;
  }

  // Accept our own download format ({ cards: {...} }) or just the cards
  // by themselves ({ "1-1": {...}, ... }).
  const incoming = data && typeof data === 'object' && data.cards ? data.cards : data;
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
    alert('That file doesn\'t contain any binder cards.');
    return;
  }

  // Keep only the valid cards in pockets that exist (like "3-5").
  // cleanCards() is in binder-storage.js.
  const { cards, skipped } = cleanCards(incoming);

  const count = Object.keys(cards).length;
  if (count === 0) {
    alert('No usable cards were found in that file.');
    return;
  }

  // Uploading REPLACES the binder, so check first if it already has cards.
  const current = Object.keys(loadBinder()).length;
  if (current > 0 && !confirm(
    `Replace the ${current} card${current === 1 ? '' : 's'} in your binder ` +
    `with the ${count} card${count === 1 ? '' : 's'} from this file?`)) {
    return;
  }

  if (!saveBinder(cards)) {
    alert('Your browser blocked saving, so the binder could not be loaded.');
    return;
  }
  if (skipped > 0) {
    alert(`Loaded ${count} cards. ${skipped} entr${skipped === 1 ? 'y was' : 'ies were'} skipped because ${skipped === 1 ? 'it wasn\'t' : 'they weren\'t'} valid.`);
  }
  // Reload the page so every pocket is rebuilt from the new cards (it then
  // saves them to Google Drive). Keep the same page open in the address.
  location.href = `binder.html?binder=${encodeURIComponent(BINDER_ID)}&page=${currentPage}`;
});

/* =====================================================================
   SAVING TO GOOGLE DRIVE
   The binder's real home is its file in the user's Google Drive (see
   google-drive.js). This page works on the browser's copy and keeps Drive
   up to date:
   - When the page opens, it fetches the binder from Drive (in case it was
     changed on another computer), or sends this browser's changes to
     Drive if there are some that haven't been saved yet.
   - After each change (moving or removing a card), it saves to Drive a
     moment later. Waiting a moment means several quick changes are sent
     together in one save.
   - If the Google sign-in has run out (it lasts about an hour), changes
     are kept in this browser and a "Connect Drive" button appears. Clicking
     it signs in again and saves everything.
   ===================================================================== */

// How long to wait after a change before saving to Drive (milliseconds).
const DRIVE_SAVE_DELAY_MS = 1200;

// The waiting timer for the next save to Drive.
let driveSaveTimer = null;

// Show the save status in the top bar. "state" picks the look:
// 'saved', 'saving', 'error', or 'signed-out' (which shows the Connect button).
function setSyncStatus(state, text) {
  syncStatus.textContent = text;
  syncStatus.dataset.state = state;
  syncConnect.hidden = state !== 'signed-out';
}

// Put new cards into the binder (after fetching them from Drive) and
// redraw every pocket so the page matches.
function replaceAllCards(cards) {
  for (const key of Object.keys(binderCards)) delete binderCards[key];
  Object.assign(binderCards, cards);
  for (let page = 1; page <= TOTAL_PAGES; page++) {
    for (let slot = 1; slot <= POCKETS_PER_PAGE; slot++) refreshPocket(pocketKey(page, slot));
  }
}

// Bring this binder up to date with Google Drive now.
async function syncWithDrive() {
  clearTimeout(driveSaveTimer);
  if (!isSignedIn()) {
    setSyncStatus('signed-out', binderDirtyStamp(BINDER_ID) ? 'Not saved to Drive yet' : '');
    return;
  }
  setSyncStatus('saving', 'Saving…');
  const before = JSON.stringify(binderCards);
  try {
    const cards = await syncBinder(BINDER_ID);   // google-drive.js
    // Drive had a different version (changed elsewhere): show that one.
    // (Skipped while a card is being dragged, so it doesn't vanish mid-drag;
    // the next save brings everything into line.)
    if (!drag && JSON.stringify(cards) !== before) replaceAllCards(cards);
    setSyncStatus('saved', '✓ Saved to Drive');
  } catch (err) {
    if (err.signedOut) setSyncStatus('signed-out', 'Not saved to Drive yet');
    else setSyncStatus('error', 'Couldn\'t reach Google Drive');
  }
}

// After a change: save to Drive in a moment (restarting the wait if more
// changes come in quickly).
function scheduleDriveSave() {
  clearTimeout(driveSaveTimer);
  if (!isSignedIn()) {
    setSyncStatus('signed-out', 'Not saved to Drive yet');
    return;
  }
  setSyncStatus('saving', 'Saving…');
  driveSaveTimer = setTimeout(syncWithDrive, DRIVE_SAVE_DELAY_MS);
}

// "Connect Drive": sign in to Google again, then save.
syncConnect.addEventListener('click', async () => {
  try {
    await signInWithGoogle();   // google-drive.js
    syncWithDrive();
  } catch (err) {
    alert(err.message);
  }
});

// When the page opens: get Google's sign-in ready (for the Connect button)
// and bring the binder up to date with Drive.
initGoogleSignIn().catch(() => { /* the Connect button explains if needed */ });
if (BINDER_ID) syncWithDrive();

// The "Sign out" link at the bottom right (google-drive.js saves any
// unsaved changes first). Afterwards, go to the sign-in screen.
setUpFooterSignOut(() => { location.href = 'index.html'; });
