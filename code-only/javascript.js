const root        = document.documentElement;
const themeSwitch = document.getElementById('themeSwitch');
const binder      = document.getElementById('binder');
const prevButton  = document.getElementById('prevPage');
const nextButton  = document.getElementById('nextPage');
const pageStatus  = document.getElementById('pageStatus');
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
  storageSet('theme', theme);
}

themeSwitch.addEventListener('click', () => {
  setTheme(root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
});

themeSwitch.setAttribute('aria-checked', String(root.getAttribute('data-theme') === 'dark'));

const binderCards = loadBinder(BINDER_ID);

const highestUsedPage = Math.max(0, ...Object.keys(binderCards).map((key) => Number(key.split('-')[0])));
const TOTAL_PAGES = Math.min(Math.max(binderPages(BINDER_ID), highestUsedPage), MAX_PAGES);

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

const PICTURE_PAGES_AHEAD = 2;
const loadedPages = new Set();

function fillPocket(pocket, page, slot) {
  const card = binderCards[pocketKey(page, slot)];
  const link = document.createElement('a');
  link.href = searchLinkFor(page, slot, card);

  if (card) {
    link.className = 'pocket-card';
    link.setAttribute('aria-label', `${card.name}, pocket ${slot}. Open in card search`);
    const img = document.createElement('img');
    if (loadedPages.has(page)) img.src = card.image;
    else img.dataset.src = card.image;
    img.alt = '';
    img.draggable = false;
    link.draggable = false;
    link.appendChild(img);
  } else {
    link.className = 'pocket-add';
    link.setAttribute('aria-label', `Add a card to pocket ${slot}`);
    link.textContent = '+';
  }

  pocket.appendChild(link);
  if (card) pocket.appendChild(copiesBar(card, pocketKey(page, slot)));
}

function copiesBar(card, key) {
  const count = cardCount(card);
  const bar = document.createElement('div');
  bar.className = 'copies-bar';
  bar.dataset.key = key;

  const minus = document.createElement('button');
  minus.type = 'button';
  minus.className = 'copies-minus';
  minus.textContent = '−';
  minus.setAttribute('aria-label', count > 1 ? `One fewer ${card.name}` : `Remove ${card.name}`);

  const number = document.createElement('span');
  number.className = 'copies-count';
  number.textContent = count;
  number.setAttribute('aria-label', `${count} owned`);

  const plus = document.createElement('button');
  plus.type = 'button';
  plus.className = 'copies-plus';
  plus.textContent = '+';
  plus.setAttribute('aria-label', `One more ${card.name}`);
  plus.disabled = count >= MAX_COPIES;

  bar.append(minus, number, plus);
  return bar;
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
  loadPicturesNear(numbers);
}

function loadPicturesNear(numbers) {
  const first = Math.max(1, Math.min(...numbers) - PICTURE_PAGES_AHEAD);
  const last = Math.min(TOTAL_PAGES, Math.max(...numbers) + PICTURE_PAGES_AHEAD);
  for (let number = first; number <= last; number++) {
    if (loadedPages.has(number)) continue;
    loadedPages.add(number);
    const page = pageElement(number);
    if (!page) continue;
    for (const img of page.querySelectorAll('img[data-src]')) {
      img.src = img.dataset.src;
      delete img.dataset.src;
    }
  }
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
const moveCircle = document.getElementById('binderMove');
const CIRCLE_REACH = 44;

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

  const overTrash = isOverCircle(trash, x, y);
  const overMove = !overTrash && isOverCircle(moveCircle, x, y);
  trash.classList.toggle('active', overTrash);
  moveCircle.classList.toggle('active', overMove);
  drag.ghost.classList.toggle('over-circle', overTrash || overMove);

  const target = overTrash || overMove ? null : pocketAt(x, y);
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

function isOverCircle(circle, x, y) {
  const box = circle.getBoundingClientRect();
  if (box.width === 0) return false;
  const centerX = box.left + box.width / 2;
  const centerY = box.top + box.height / 2;
  return Math.hypot(x - centerX, y - centerY) <= CIRCLE_REACH;
}

function endDrag(x, y) {
  if (!drag) return;
  const removing = isOverCircle(trash, x, y);
  const toAnotherBinder = !removing && isOverCircle(moveCircle, x, y);
  const target = removing || toAnotherBinder ? null : pocketAt(x, y);
  const fromKey = drag.fromKey;
  const toKey = target ? keyOf(target) : null;
  finishDrag();

  if (toAnotherBinder) {
    openMoveDialog(fromKey);
    return;
  }

  if (removing) {
    removeCard(fromKey);
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
  moveCircle.classList.remove('active');
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
  if (event.target.closest('.copies-bar')) return;
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
  if (event.target.closest('.copies-bar')) return;
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

const removeCardDialog = document.getElementById('removeCardDialog');
const removeCardText   = document.getElementById('removeCardText');

let removingKey = null;

function removeCard(key) {
  const removed = binderCards[key];
  if (!removed) return;
  delete binderCards[key];
  if (!saveBinder(binderCards)) {
    binderCards[key] = removed;
    alert('Your browser blocked saving, so the card could not be removed.');
    return;
  }
  refreshPocket(key);
  scheduleDriveSave();
}

function setCopies(key, count) {
  const before = binderCards[key];
  if (!before) return;
  binderCards[key] = withCount(before, count);
  if (!saveBinder(binderCards)) {
    binderCards[key] = before;
    alert('Your browser blocked saving, so the number could not be changed.');
    return;
  }
  refreshPocket(key);
  scheduleDriveSave();
}

binder.addEventListener('click', (event) => {
  const button = event.target.closest('.copies-minus, .copies-plus');
  if (!button) return;
  const key = button.closest('.copies-bar').dataset.key;
  const card = binderCards[key];
  if (!card) return;
  const count = cardCount(card);

  if (button.classList.contains('copies-plus')) {
    setCopies(key, count + 1);
    pocketElement(key).querySelector('.copies-plus').focus();
  } else if (count > 1) {
    setCopies(key, count - 1);
    pocketElement(key).querySelector('.copies-minus').focus();
  } else {
    removingKey = key;
    removeCardText.textContent = `Remove "${card.name}" from this binder?`;
    removeCardDialog.returnValue = '';
    removeCardDialog.showModal();
  }
});

removeCardDialog.addEventListener('close', () => {
  if (removeCardDialog.returnValue === 'yes' && removingKey) removeCard(removingKey);
  removingKey = null;
});
removeCardDialog.addEventListener('click', (event) => {
  if (event.target === removeCardDialog) removeCardDialog.close('no');
});

const startPage = parseInt(new URLSearchParams(location.search).get('page'), 10);
if (startPage >= 1 && startPage <= TOTAL_PAGES) currentPage = startPage;
showPages();

const DRIVE_SAVE_DELAY_MS = 1200;

let driveSaveTimer = null;

let savedNote = null;

function setSyncStatus(state, text) {
  syncStatus.textContent = text;
  syncStatus.dataset.state = state;
  syncConnect.hidden = state !== 'signed-out';
}

function replaceAllCards(cards) {
  for (const key of Object.keys(binderCards)) delete binderCards[key];
  Object.assign(binderCards, cards);
  for (let page = 1; page <= TOTAL_PAGES; page++) {
    for (let slot = 1; slot <= POCKETS_PER_PAGE; slot++) refreshPocket(pocketKey(page, slot));
  }
}

function showSavedLocally() {
  setSyncStatus('saved', savedNote || '✓ Saved on this device');
  savedNote = null;
}

async function syncWithDrive() {
  clearTimeout(driveSaveTimer);
  if (isLocalMode()) { showSavedLocally(); return; }
  if (!isSignedIn()) {
    setSyncStatus('signed-out', binderDirtyStamp(BINDER_ID) ? 'Not saved to Drive yet' : '');
    return;
  }
  setSyncStatus('saving', 'Saving…');
  const before = JSON.stringify(binderCards);
  try {
    const cards = await syncBinder(BINDER_ID);
    if (!drag && JSON.stringify(cards) !== before) replaceAllCards(cards);
    setSyncStatus('saved', savedNote || '✓ Saved to Drive');
    savedNote = null;
  } catch (err) {
    if (err.signedOut) setSyncStatus('signed-out', 'Not saved to Drive yet');
    else setSyncStatus('error', 'Couldn\'t reach Google Drive');
  }
}

function scheduleDriveSave() {
  clearTimeout(driveSaveTimer);
  if (isLocalMode()) { showSavedLocally(); return; }
  if (!isSignedIn()) {
    setSyncStatus('signed-out', 'Not saved to Drive yet');
    return;
  }
  setSyncStatus('saving', 'Saving…');
  driveSaveTimer = setTimeout(syncWithDrive, DRIVE_SAVE_DELAY_MS);
}

syncConnect.addEventListener('click', async () => {
  try {
    await signInWithGoogle();
    syncWithDrive();
  } catch (err) {
    alert(err.message);
  }
});

initGoogleSignIn().catch(() => {  });
if (BINDER_ID) syncWithDrive();

setUpFooterSignOut(() => { location.href = 'index.html'; });

const moveCardDialog  = document.getElementById('moveCardDialog');
const moveCardText    = document.getElementById('moveCardText');
const moveTargets     = document.getElementById('moveTargets');
const moveNewName     = document.getElementById('moveNewName');
const moveNewCount    = document.getElementById('moveNewCount');
const moveToNewButton = document.getElementById('moveToNewButton');
const moveMessage     = document.getElementById('moveMessage');
const moveHowMany     = document.getElementById('moveHowMany');
const moveAmount      = document.getElementById('moveAmount');
const moveAmountNote  = document.getElementById('moveAmountNote');

function binderCapacity(id) {
  return binderPages(id) * POCKETS_PER_PAGE;
}

let movingKey = null;

function setMoveMessage(text, isError = false) {
  moveMessage.textContent = text;
  moveMessage.classList.toggle('error', isError);
}

function setMoveBusy(busy) {
  for (const button of moveCardDialog.querySelectorAll('button, input')) button.disabled = busy;
  if (!busy) refreshMoveTargets();
}

function showMoveNameCount() {
  moveNewCount.textContent = `${moveNewName.value.length} / ${moveNewName.maxLength}`;
}
moveNewName.addEventListener('input', showMoveNameCount);

function refreshMoveTargets() {
  moveTargets.replaceChildren();
  const others = loadBinderList().filter((b) => b.id !== BINDER_ID);
  if (others.length === 0) {
    const none = document.createElement('p');
    none.className = 'move-none';
    none.textContent = 'You don\'t have any other binders yet.';
    moveTargets.appendChild(none);
  }
  for (const other of others) {
    const count = Object.keys(loadBinder(other.id)).length;
    const full = count >= binderCapacity(other.id);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'move-target';
    button.disabled = full;

    const color = manaColor(other.color);
    const symbol = document.createElement(color ? 'img' : 'span');
    symbol.className = 'move-symbol';
    if (color) { symbol.src = color.symbol; symbol.alt = ''; }

    const name = document.createElement('span');
    name.className = 'move-name';
    name.textContent = other.name;

    const info = document.createElement('span');
    info.className = 'move-count';
    info.textContent = full ? 'Full' : `${count} card${count === 1 ? '' : 's'}`;

    button.append(symbol, name, info);
    button.addEventListener('click', () => moveCardTo(other.id));
    moveTargets.appendChild(button);
  }
}

function openMoveDialog(key) {
  const card = binderCards[key];
  if (!card) return;
  movingKey = key;
  moveCardText.textContent = `Pick a binder for "${card.name}". It goes into that binder's first empty pocket.`;
  setMoveMessage('');

  const owned = cardCount(card);
  moveHowMany.hidden = owned < 2;
  moveAmount.max = owned;
  moveAmount.value = owned;
  moveAmountNote.textContent = `of ${owned}`;
  refreshMoveTargets();

  moveNewName.value = nextBinderName();
  showMoveNameCount();

  moveCardDialog.returnValue = '';
  moveCardDialog.showModal();
  refreshMoveCountsFromDrive();
}

async function refreshMoveCountsFromDrive() {
  if (!isSignedIn()) return;
  const others = loadBinderList().filter((b) => b.id !== BINDER_ID);
  await Promise.all(others.map((b) => syncBinder(b.id).catch(() => {  })));
  if (moveCardDialog.open && !moveToNewButton.disabled) refreshMoveTargets();
}

async function ensureSignedIn() {
  if (!isLocalMode() && !isSignedIn()) await signInWithGoogle();
}

function amountToMove(card) {
  const owned = cardCount(card);
  if (moveHowMany.hidden) return owned;
  const typed = Math.round(Number(moveAmount.value));
  return Number.isFinite(typed) ? Math.min(Math.max(typed, 1), owned) : owned;
}

async function moveCardTo(targetId) {
  const card = binderCards[movingKey];
  if (!card) return;
  const amount = amountToMove(card);
  setMoveBusy(true);
  setMoveMessage('Moving…');
  try {
    await ensureSignedIn();
    const cards = await syncBinder(targetId);
    const sameKey = Object.keys(cards).find((k) => samePrinting(cards[k], card));
    let page;
    if (sameKey) {
      cards[sameKey] = withCount(cards[sameKey], cardCount(cards[sameKey]) + amount);
      page = sameKey.split('-')[0];
    } else {
      const spot = firstEmptyPocket(cards, binderPages(targetId));
      if (!spot) {
        setMoveBusy(false);
        setMoveMessage(`"${binderName(targetId)}" is full.`, true);
        return;
      }
      cards[pocketKey(spot.page, spot.slot)] = withCount(card, amount);
      page = spot.page;
    }
    saveBinder(cards, targetId);
    await syncBinder(targetId);
    takeMovedCardOut(`✓ Moved ${amount > 1 ? `${amount} ` : ''}to ${binderName(targetId)}, page ${page}`, amount);
  } catch (err) {
    setMoveBusy(false);
    setMoveMessage(err.message, true);
  }
}

moveToNewButton.addEventListener('click', async () => {
  const card = binderCards[movingKey];
  if (!card) return;
  const amount = amountToMove(card);
  const binders = loadBinderList();
  const name = moveNewName.value.trim().slice(0, moveNewName.maxLength) || nextBinderName();
  setMoveBusy(true);
  setMoveMessage('Making the new binder…');
  try {
    await ensureSignedIn();
    const cards = { [pocketKey(1, 1)]: withCount(card, amount) };
    const file = await createBinderFile(name, cards, null, binders.length);
    binders.push({ id: file.id, name, color: null, cover: DEFAULT_COVER, pages: DEFAULT_PAGES });
    saveBinderList(binders);
    saveBinder(cards, file.id, { dirty: false });
    takeMovedCardOut(`✓ Moved ${amount > 1 ? `${amount} ` : ''}to new binder ${name}`, amount);
  } catch (err) {
    setMoveBusy(false);
    setMoveMessage(err.message, true);
  }
});

function takeMovedCardOut(note, amount) {
  const left = cardCount(binderCards[movingKey]) - amount;
  if (left > 0) binderCards[movingKey] = withCount(binderCards[movingKey], left);
  else delete binderCards[movingKey];
  saveBinder(binderCards);
  refreshPocket(movingKey);
  movingKey = null;
  setMoveBusy(false);
  moveCardDialog.close('done');
  savedNote = note;
  scheduleDriveSave();
}

moveCardDialog.addEventListener('close', () => { movingKey = null; });

moveCardDialog.addEventListener('click', (event) => {
  if (event.target === moveCardDialog) moveCardDialog.close('cancel');
});
