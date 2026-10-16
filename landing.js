/* =========================================================================
   landing.js — all the code that makes index.html (the landing page) work:
   the light/dark switch, signing in with Google, and the shelf of binders
   (open one, or make a new one with the "+" binder, choosing a
   Magic color symbol for its cover).
   It's loaded at the bottom of index.html, after binder-storage.js and
   google-drive.js (which it uses).
   ========================================================================= */

/* =====================================================================
   FINDING THE PAGE ELEMENTS
   ===================================================================== */

const root           = document.documentElement;   // the <html> tag
const themeSwitch    = document.getElementById('themeSwitch');
const signedOutView  = document.getElementById('signedOutView');
const signInButton   = document.getElementById('signInButton');
const signInMessage  = document.getElementById('signInMessage');
const signedInView   = document.getElementById('signedInView');
const accountName    = document.getElementById('accountName');
const footerSignOut  = document.getElementById('footerSignOut');
const myBindersItem  = document.getElementById('myBindersItem');   // the footer's "My Binders" link
const binderShelf    = document.getElementById('binderShelf');
const shelfMessage   = document.getElementById('shelfMessage');
const newBinderDialog = document.getElementById('newBinderDialog');
const colorChoices    = document.getElementById('colorChoices');
const editBinderDialog   = document.getElementById('editBinderDialog');
const editColorChoices   = document.getElementById('editColorChoices');
const binderNameInput    = document.getElementById('binderNameInput');
const nameCount          = document.getElementById('nameCount');
const deleteBinderDialog = document.getElementById('deleteBinderDialog');
const deleteBinderText   = document.getElementById('deleteBinderText');
const editDropZone       = document.getElementById('editDropZone');
const deleteDropZone     = document.getElementById('deleteDropZone');

// nextBinderName() is in binder-storage.js, shared with the binder page.
// There's no limit on how many binders someone can have: the shelf just
// keeps adding rows of three.

/* =====================================================================
   LIGHT / DARK MODE
   ===================================================================== */

// Apply a theme ('light' or 'dark'), update the switch, and remember it.
function setTheme(theme) {
  root.setAttribute('data-theme', theme);
  themeSwitch.setAttribute('aria-checked', String(theme === 'dark'));
  try { localStorage.setItem('theme', theme); } catch (e) { /* storage blocked: ignore */ }
}

// Clicking the switch flips between light and dark.
themeSwitch.addEventListener('click', () => {
  setTheme(root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
});

// When the page opens, make the switch match the theme already applied
// by the little script at the top of the page.
themeSwitch.setAttribute('aria-checked', String(root.getAttribute('data-theme') === 'dark'));

/* =====================================================================
   SIGNING IN AND OUT
   ===================================================================== */

// Show the sign-in screen, with an optional message under the button.
function showSignedOut(message = '') {
  signedInView.hidden = true;
  signedOutView.hidden = false;
  footerSignOut.hidden = true;   // nothing to sign out of
  myBindersItem.hidden = true;   // no binders to link to until signed in
  signInMessage.textContent = message;
  signInButton.disabled = false;
}

// Clicking "Sign in with Google": open Google's sign-in window. Once
// signed in, show the binders.
signInButton.addEventListener('click', async () => {
  signInMessage.textContent = '';
  signInButton.disabled = true;
  try {
    await signInWithGoogle();   // google-drive.js
    showSignedIn();
  } catch (err) {
    showSignedOut(err.message);
  }
});

// The "Sign out" link at the bottom right (google-drive.js does the
// saving, signing out and forgetting). Afterwards, show the sign-in screen.
setUpFooterSignOut(() => showSignedOut('You\'re signed out.'));

/* =====================================================================
   THE SHELF OF BINDERS
   ===================================================================== */

// Show the signed-in view: who's signed in, and their binders. The
// binders this browser already knows about appear straight away, then
// the shelf is refreshed from Google Drive.
async function showSignedIn() {
  signedOutView.hidden = true;
  signedInView.hidden = false;
  footerSignOut.hidden = false;   // show "Sign out" at the bottom right
  myBindersItem.hidden = false;   // and the "My Binders" link
  renderShelf(loadBinderList());
  shelfMessage.classList.remove('error');
  shelfMessage.textContent = 'Loading your binders…';

  try {
    // Who's signed in (shown above the shelf).
    const user = await getDriveUser();
    accountName.textContent = `Signed in as ${user.displayName || user.emailAddress}`;

    // The binder files in their Drive (oldest first), with each one's cover
    // color, number of pages and shelf position (labels stored on the file;
    // an unknown color counts as none, and no page count means 10).
    const files = await listBinderFiles();
    let binders = files.map((file) => {
      const labels = file.appProperties || {};
      return {
        id: file.id,
        name: nameFromFileName(file.name),
        color: manaColor(labels.color) ? labels.color : null,
        pages: cleanPageCount(labels.pages),
        order: labels.order !== undefined ? Number(labels.order) : null
      };
    });

    // Put them in the order the user arranged them. Binders without a saved
    // position (made before positions were saved) go after the others, oldest
    // first. ("sort" keeps the oldest-first order among equal positions.)
    binders.sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));
    binders = binders.map(({ id, name, color, pages }) => ({ id, name, color, pages }));

    // First time signing in? If this browser still has cards from before
    // binders were saved in Drive, move them into a first binder.
    if (binders.length === 0) binders = await moveOldCardsIntoFirstBinder();

    // Bring each binder up to date between this browser and Drive (all at
    // once), which also gives us each binder's card count.
    saveBinderList(binders);
    await Promise.all(binders.map((b) => syncBinder(b.id)));

    renderShelf(binders);
    shelfMessage.textContent = '';
  } catch (err) {
    if (err.signedOut) {
      showSignedOut(err.message);
      return;
    }
    shelfMessage.classList.add('error');
    shelfMessage.textContent = `Couldn't load your binders from Google Drive. ${err.message}`;
  }
}

// If cards from the old single binder are still in this browser, put them
// into a new "Binder 1" in Drive and forget the old copy. Returns the list
// of binders (with that one in it, or empty if there was nothing to move).
async function moveOldCardsIntoFirstBinder() {
  let oldCards = {};
  try { oldCards = JSON.parse(storageGet(OLD_SINGLE_BINDER_KEY)) || {}; } catch (e) { /* unreadable */ }
  const { cards } = cleanCards(oldCards);
  if (Object.keys(cards).length === 0) return [];

  const name = 'Binder 1';
  const file = await createBinderFile(name, { app: FILE_APP_NAME, version: 1, name, color: null, cards });
  saveBinder(cards, file.id, { dirty: false });
  storageRemove(OLD_SINGLE_BINDER_KEY);
  return [{ id: file.id, name, color: null, pages: DEFAULT_PAGES }];
}

// Draw the shelf: a closed binder for each binder (a link that opens it),
// then the "+" binder for making a new one.
function renderShelf(binders) {
  binderShelf.replaceChildren();

  for (const binder of binders) {
    const count = Object.keys(loadBinder(binder.id)).length;
    const tile = document.createElement('a');
    tile.className = 'binder-tile';
    tile.href = `binder.html?binder=${encodeURIComponent(binder.id)}`;
    tile.dataset.id = binder.id;    // which binder this is, for dragging
    tile.draggable = false;         // we handle dragging ourselves (see below)
    const color = manaColor(binder.color);
    const colorWords = color ? `, ${color.name}` : '';
    tile.setAttribute('aria-label', `Open ${binder.name}${colorWords}, ${count} card${count === 1 ? '' : 's'}`);
    tile.append(closedBinder(binder.name, binder.color), caption(`${count} card${count === 1 ? '' : 's'}`));
    binderShelf.appendChild(tile);
  }

  // The "+" binder, always last on the shelf (there's no limit on binders).
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
  addTile.addEventListener('click', openNewBinderDialog);
  binderShelf.appendChild(addTile);

  fitCoverLabels();
}

// Make sure every name fits on one line of its cover label: if a name is
// wider than its label (only possible with extra-wide letters, like "WWW"),
// shrink that label's text a step at a time until it fits (but never
// below 8px, so it stays readable; past that, landing.css ends it in "…").
function fitCoverLabels() {
  for (const label of binderShelf.querySelectorAll('.cover-label')) {
    label.style.fontSize = '';   // start from the normal size
    let size = parseFloat(getComputedStyle(label).fontSize);
    while (nameTooWide(label) && size > 8) {
      size -= 0.5;
      label.style.fontSize = `${size}px`;
    }
  }
}

// Is a label's name wider than the space inside the label? This measures
// exactly, to fractions of a pixel: the browser's simpler "scrollWidth"
// rounds to whole pixels, so a name just half a pixel too wide looked like
// it fit, and the browser then cut it short with "…".
// A "range" wraps the label's text, so we can ask how wide the text is.
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

// Phones turned sideways (or a resized window) change the binders' size,
// so fit the names again.
window.addEventListener('resize', fitCoverLabels);

// Build the picture of a closed binder. With a name, it gets a label
// window on the cover showing the name. With a color code ("U" etc.), that
// color's symbol goes in the center of the cover.
function closedBinder(name, colorCode) {
  const cover = document.createElement('span');
  cover.className = 'closed-binder';
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
    symbol.alt = '';   // the tile's label already says the color
    symbol.draggable = false;
    cover.appendChild(symbol);
  }
  return cover;
}

// Build the small caption under a binder.
function caption(text) {
  const span = document.createElement('span');
  span.className = 'tile-caption';
  span.textContent = text;
  return span;
}

/* =====================================================================
   THE "NEW BINDER" WINDOW (choose a color symbol, or none)
   ===================================================================== */

// Fill a window's symbol choices, in two parts:
//  - "None", the five colors, Colorless and Planeswalker (two rows of 4)
//  - under a small "Two colors" heading, the ten two-color symbols (two rows of 5)
// Each choice is a radio button (only one in the whole set can be picked)
// wrapped in a label, so clicking the symbol or its name picks it.
// "container" is where they go; "groupName" ties one window's radio
// buttons together (the New binder and Properties windows each have a set).
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
    choice.title = option.name;      // hovering shows the full name, e.g. "White and Blue"

    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = groupName;
    radio.value = option.code;
    // Screen readers say the full name and the short one ("White and Blue, Azorius").
    if (option.short !== option.name) radio.setAttribute('aria-label', `${option.name}, ${option.short}`);

    // The picture: the color's symbol, or an empty circle for "None".
    let picture;
    if (option.symbol) {
      picture = document.createElement('img');
      picture.src = option.symbol;
      picture.alt = '';                 // the name below says which color
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
buildColorChoices(colorChoices, 'binderColor');

// The name box and its "5 / 12" counter in the New binder window.
const newBinderName = document.getElementById('newBinderName');
const newNameCount  = document.getElementById('newNameCount');

// Keep a name box's "5 / 12" counter up to date (characters used of the
// box's limit). Used by both the New binder and Binder properties windows.
function showNameCount(input, counter) {
  counter.textContent = `${input.value.length} / ${input.maxLength}`;
}
newBinderName.addEventListener('input', () => showNameCount(newBinderName, newNameCount));

// Clicking the "+" binder: open the window with the next free name filled
// in (and selected, so typing replaces it) and "None" picked.
function openNewBinderDialog() {
  newBinderName.value = nextBinderName();
  showNameCount(newBinderName, newNameCount);
  newBinderDialog.querySelector('input[value=""]').checked = true;
  // Forget which button closed the window last time, so closing it with
  // Escape now can't count as an old "Create binder".
  newBinderDialog.returnValue = '';
  newBinderDialog.showModal();
  newBinderName.select();
}

// When the window closes, see which button closed it. "Create binder" makes
// the binder with the typed name and the picked color ("" means none);
// Cancel does nothing. (The name box is "required", so it can't be blank;
// spaces-only still falls back to the default name.)
newBinderDialog.addEventListener('close', () => {
  if (newBinderDialog.returnValue !== 'create') return;
  const picked = newBinderDialog.querySelector('input[name="binderColor"]:checked');
  const name = newBinderName.value.trim().slice(0, newBinderName.maxLength) || nextBinderName();
  makeNewBinder(name, picked && picked.value ? picked.value : null);
});

// Clicking on the dimmed area outside a window closes it, like Cancel / No.
// (A click on the dimmed area counts as a click on the <dialog> itself.)
function closeOnBackdropClick(dialog) {
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close('cancel');
  });
}
closeOnBackdropClick(newBinderDialog);

// Make a new, empty binder file in Google Drive with the chosen name and
// cover color, and add it to the end of the shelf.
async function makeNewBinder(name, color) {
  const binders = loadBinderList();
  const addTile = document.getElementById('addBinderTile');
  if (addTile) addTile.disabled = true;
  shelfMessage.classList.remove('error');
  shelfMessage.textContent = 'Making a new binder…';

  try {
    // The new binder goes at the end of the shelf (its position = how many
    // binders came before it).
    const file = await createBinderFile(name, { app: FILE_APP_NAME, version: 1, name, color, cards: {} }, color, binders.length);
    saveBinder({}, file.id, { dirty: false });
    binders.push({ id: file.id, name, color, pages: DEFAULT_PAGES });
    saveBinderList(binders);
    renderShelf(binders);
    shelfMessage.textContent = '';
  } catch (err) {
    if (err.signedOut) {
      showSignedOut(err.message);
      return;
    }
    if (addTile) addTile.disabled = false;
    shelfMessage.classList.add('error');
    shelfMessage.textContent = `Couldn't make a new binder. ${err.message}`;
  }
}

/* =====================================================================
   DRAGGING BINDERS: REARRANGE, EDIT OR DELETE
   Pick up a binder and:
   - drop it on another binder's spot to move it there (the others shift
     along to make room), to put the binders in any order
   - drop it on the pencil circle at the top to rename it or change its
     symbol (the Binder properties window)
   - drop it on the red X circle at the bottom to delete it (after asking)
   With a mouse: press and move. On a phone: press and HOLD a moment until
   it lifts, then slide. A plain click or tap still opens the binder.
   Escape (or dropping it anywhere else) puts it back.
   ===================================================================== */

// How far the mouse must move (pixels) before a press becomes a drag.
const DRAG_START_DISTANCE = 6;

// How long (milliseconds) a finger must hold still to pick a binder up,
// and how far it may wander meanwhile before it counts as scrolling.
const HOLD_TO_DRAG_MS = 350;
const HOLD_WOBBLE = 10;

// How close (pixels from the center) a dragged binder must be to the edit
// or delete circle to count as "over" it (the circles are 64px across).
const DROP_ZONE_REACH = 52;

// The drag in progress (null when nothing is being dragged). It holds the
// binder's id, its tile on the shelf, the floating copy that follows the
// pointer, where on the binder it was grabbed, and what's under it now.
let drag = null;

// A mouse press that might become a drag, a finger hold in progress, and
// when the last drag ended (the click right after a drag is ignored, so
// dropping a binder doesn't also open it).
let pendingMouse = null;
let holdTimer = null;
let holdStart = null;
let lastDragEnd = 0;

// The binder tile (not the "+" one) under a point on the screen, if any.
// The floating copy ignores the pointer, so this "sees" through it.
function tileAt(x, y) {
  const element = document.elementFromPoint(x, y);
  const tile = element && element.closest('a.binder-tile');
  return tile && binderShelf.contains(tile) ? tile : null;
}

// Is the point within reach of a drop circle's center (and is it showing)?
function overZone(zone, x, y) {
  const box = zone.getBoundingClientRect();
  if (box.width === 0) return false;
  return Math.hypot(x - (box.left + box.width / 2), y - (box.top + box.height / 2)) <= DROP_ZONE_REACH;
}

// Pick up a binder. (x, y) is where the pointer is.
function beginDrag(tile, x, y) {
  const cover = tile.querySelector('.closed-binder');
  const box = cover.getBoundingClientRect();

  // The floating copy: a clone of the binder's cover, the same size.
  const ghost = document.createElement('div');
  ghost.className = 'binder-ghost';
  ghost.style.width = `${box.width}px`;
  ghost.style.height = `${box.height}px`;
  ghost.appendChild(cover.cloneNode(true));
  document.body.appendChild(ghost);

  drag = { id: tile.dataset.id, tile, ghost, grabX: x - box.left, grabY: y - box.top, target: null, zone: null };
  tile.classList.add('drag-source');          // dim the binder left behind
  document.body.classList.add('dragging');    // shows the edit and delete circles
  moveDrag(x, y);
}

// Move the floating copy with the pointer, and light up whatever it's over:
// the edit circle, the delete circle, or another binder's spot.
function moveDrag(x, y) {
  if (!drag) return;
  drag.ghost.style.transform =
    `translate(${x - drag.grabX}px, ${y - drag.grabY}px) rotate(-3deg) scale(1.05)`;

  drag.zone = overZone(editDropZone, x, y) ? 'edit'
    : overZone(deleteDropZone, x, y) ? 'delete' : null;
  editDropZone.classList.toggle('active', drag.zone === 'edit');
  deleteDropZone.classList.toggle('active', drag.zone === 'delete');
  drag.ghost.classList.toggle('over-zone', drag.zone !== null);   // fade so the circle shows

  const target = drag.zone ? null : tileAt(x, y);
  const useful = target && target !== drag.tile ? target : null;
  if (useful !== drag.target) {
    if (drag.target) drag.target.classList.remove('drop-target');
    if (useful) useful.classList.add('drop-target');
    drag.target = useful;
  }
}

// Let go of the binder and do whatever it was dropped on.
function endDrag(x, y) {
  if (!drag) return;
  moveDrag(x, y);   // make sure "what's underneath" is up to date
  const { id, zone, target } = drag;
  const targetId = target ? target.dataset.id : null;
  finishDrag();

  if (zone === 'delete') openDeleteDialog(id);
  else if (zone === 'edit') openEditDialog(id);
  else if (targetId) moveBinder(id, targetId);
}

// Clean up after a drag: remove the floating copy, highlights and the circles.
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

// Move a binder to another binder's spot. The binders in between shift
// along by one to make room. Then save the new order to Google Drive.
function moveBinder(id, targetId) {
  const binders = loadBinderList();
  const from = binders.findIndex((b) => b.id === id);
  const to = binders.findIndex((b) => b.id === targetId);
  if (from < 0 || to < 0) return;
  const [moving] = binders.splice(from, 1);   // take it out...
  binders.splice(to, 0, moving);              // ...and put it in its new spot
  saveBinderList(binders);
  renderShelf(binders);
  saveShelfOrder(binders);
}

// Save every binder's position (0, 1, 2, ...) as a label on its Drive file,
// so the order is the same on every computer.
async function saveShelfOrder(binders) {
  shelfMessage.classList.remove('error');
  shelfMessage.textContent = 'Saving the new order…';
  try {
    await Promise.all(binders.map((b, index) => updateBinderDetails(b.id, { order: index })));
    shelfMessage.textContent = '';
  } catch (err) {
    if (err.signedOut) { showSignedOut(err.message); return; }
    shelfMessage.classList.add('error');
    shelfMessage.textContent = `Couldn't save the new order to Google Drive. ${err.message}`;
  }
}

// --- With a mouse (or pen) ---------------------------------------------

// Pressing on a binder: remember it, but only start dragging once the mouse
// moves a little, so a simple click still opens the binder.
binderShelf.addEventListener('pointerdown', (event) => {
  if (event.pointerType === 'touch' || event.button !== 0) return;
  const tile = event.target.closest('a.binder-tile');
  if (!tile) return;
  event.preventDefault();   // stop the browser selecting text or dragging the link
  pendingMouse = { tile, x: event.clientX, y: event.clientY };
});

// Moving the mouse: start the drag once it's moved far enough, then keep
// the floating copy following it.
window.addEventListener('pointermove', (event) => {
  if (event.pointerType === 'touch') return;
  if (pendingMouse && Math.hypot(event.clientX - pendingMouse.x, event.clientY - pendingMouse.y) >= DRAG_START_DISTANCE) {
    beginDrag(pendingMouse.tile, pendingMouse.x, pendingMouse.y);
    pendingMouse = null;
  }
  moveDrag(event.clientX, event.clientY);
});

// Letting go of the mouse button: drop the binder.
window.addEventListener('pointerup', (event) => {
  if (event.pointerType === 'touch') return;
  pendingMouse = null;
  endDrag(event.clientX, event.clientY);
});

// --- With a finger (phones and tablets) -----------------------------------

// Touching a binder starts the "hold" countdown; holding still long enough
// lifts it.
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
    if (navigator.vibrate) navigator.vibrate(15);   // a tiny buzz, on phones that can
  }, HOLD_TO_DRAG_MS);
}, { passive: true });

// Moving the finger: before the binder lifts, moving too far cancels the
// hold (it was a scroll). Once lifted, the binder follows the finger and
// "preventDefault" stops the page scrolling ("passive: false" allows that).
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

// Lifting the finger: drop the binder (or just cancel a hold that never lifted).
binderShelf.addEventListener('touchend', (event) => {
  clearTimeout(holdTimer);
  holdTimer = null;
  if (drag) {
    const touch = event.changedTouches[0];
    endDrag(touch.clientX, touch.clientY);
  }
});

// The phone interrupted the touch: put the binder back.
binderShelf.addEventListener('touchcancel', () => {
  clearTimeout(holdTimer);
  holdTimer = null;
  finishDrag();
});

// --- Both ------------------------------------------------------------------

// Escape, or the window losing focus, puts the binder back.
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') { pendingMouse = null; finishDrag(); }
});
window.addEventListener('blur', () => { pendingMouse = null; finishDrag(); });

// Ignore the click browsers send right after a drag, so dropping a binder
// doesn't also open it. ("true" = catch the click before the link sees it.)
binderShelf.addEventListener('click', (event) => {
  if (drag || Date.now() - lastDragEnd < 400) {
    event.preventDefault();
    event.stopPropagation();
  }
}, true);

// A long press on a phone normally opens a menu (Open link…); block it on
// binders, since a long press now picks the binder up.
binderShelf.addEventListener('contextmenu', (event) => {
  if (event.target.closest('a.binder-tile')) event.preventDefault();
});

/* =====================================================================
   THE "BINDER PROPERTIES" WINDOW (rename, pages, change the symbol)
   ===================================================================== */

// The Pages box and the note beside it.
const binderPagesInput = document.getElementById('binderPagesInput');
const pagesNote        = document.getElementById('pagesNote');

// Update the note beside the Pages box: how many cards that many pages
// hold, and the allowed range. If the number is outside the range, the
// note turns red and says why (and the browser won't let Save go ahead,
// because of the box's min and max).
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

// The most characters a binder's name can have. It comes from the name
// box's maxlength in index.html, chosen so a name always fits on one line
// of the cover's label.
const NAME_LIMIT = binderNameInput.maxLength;

// The binder being edited (its id) while the window is open.
let editingId = null;

// Fill the window's symbol choices (the same set as the New binder window).
buildColorChoices(editColorChoices, 'editColor');

// Keep the "5 / 12" counter next to the name box up to date
// (showNameCount is shared with the New binder window).
binderNameInput.addEventListener('input', () => showNameCount(binderNameInput, nameCount));

// Open the window for a binder, filled in with its current name, number of
// pages and symbol. The Pages box can't go below the fewest pages its
// cards need, or above the 50-page limit.
function openEditDialog(id) {
  const binder = loadBinderList().find((b) => b.id === id);
  if (!binder) return;
  editingId = id;
  binderNameInput.value = binder.name.slice(0, NAME_LIMIT);
  showNameCount(binderNameInput, nameCount);
  const cardCount = Object.keys(loadBinder(id)).length;
  binderPagesInput.min = minPagesFor(cardCount);
  binderPagesInput.max = MAX_PAGES;
  binderPagesInput.value = binderPages(id);
  updatePagesNote();
  editBinderDialog.querySelector(`input[name="editColor"][value="${binder.color || ''}"]`).checked = true;
  // Forget which button closed the window last time, so closing it with
  // Escape now can't count as an old "Save".
  editBinderDialog.returnValue = '';
  editBinderDialog.showModal();
  binderNameInput.select();   // ready to type a new name
}

// When the window closes with "Save": update the binder on the shelf and in
// Google Drive. (A blank name or an out-of-range page count isn't allowed:
// the boxes are "required" with limits, so the browser stops Save.)
editBinderDialog.addEventListener('close', async () => {
  const id = editingId;
  editingId = null;
  if (editBinderDialog.returnValue !== 'save' || !id) return;
  const name = binderNameInput.value.trim().slice(0, NAME_LIMIT);
  if (!name) return;
  const picked = editBinderDialog.querySelector('input[name="editColor"]:checked');
  const color = picked && picked.value ? picked.value : null;
  // The page count, kept within the limits just in case.
  let pages = Math.min(Math.max(cleanPageCount(binderPagesInput.value), Number(binderPagesInput.min)), MAX_PAGES);
  const oldPages = binderPages(id);

  // Show the change straight away...
  const binders = loadBinderList();
  const binder = binders.find((b) => b.id === id);
  if (!binder) return;
  binder.name = name;
  binder.color = color;
  binder.pages = pages;
  saveBinderList(binders);
  renderShelf(binders);

  // ...then save it to Drive (renaming the file and setting its labels).
  shelfMessage.classList.remove('error');
  shelfMessage.textContent = 'Saving…';
  try {
    // Fewer pages than before? Make sure no card is left on a page that's
    // going away: get the binder's latest cards from Drive, and move any on
    // those pages into empty pockets on the pages that stay.
    if (pages < oldPages) {
      const cards = await syncBinder(id);
      // (If cards were added on another computer meanwhile, it may need
      // more pages than the window allowed: never go below what's needed.)
      const needed = minPagesFor(Object.keys(cards).length);
      if (pages < needed) {
        pages = needed;
        binder.pages = pages;
        saveBinderList(binders);
        renderShelf(binders);
      }
      const fitted = fitCardsIntoPages(cards, pages);   // binder-storage.js
      if (JSON.stringify(fitted) !== JSON.stringify(cards)) {
        saveBinder(fitted, id);    // keep the moved cards (marked "needs saving")...
        await syncBinder(id);      // ...and save them to Drive
      }
    }
    await updateBinderDetails(id, { name, color, pages });
    shelfMessage.textContent = '';
  } catch (err) {
    if (err.signedOut) { showSignedOut(err.message); return; }
    shelfMessage.classList.add('error');
    shelfMessage.textContent = `Couldn't save the changes to Google Drive. ${err.message}`;
  }
});
closeOnBackdropClick(editBinderDialog);

/* =====================================================================
   THE "DELETE THIS BINDER?" WINDOW
   ===================================================================== */

// The binder that might be deleted (its id) while the window is open.
let deletingId = null;

// Ask before deleting: say which binder and how many cards are in it.
function openDeleteDialog(id) {
  const binder = loadBinderList().find((b) => b.id === id);
  if (!binder) return;
  deletingId = id;
  const count = Object.keys(loadBinder(id)).length;
  deleteBinderText.textContent =
    `"${binder.name}" and its ${count} card${count === 1 ? '' : 's'} will be deleted. ` +
    'It goes to your Google Drive trash, where it can be restored for 30 days.';
  deleteBinderDialog.returnValue = '';   // forget last time's answer (see openEditDialog)
  deleteBinderDialog.showModal();
}

// "Yes, delete": move the binder's file to the Drive trash, then take it
// off the shelf and out of this browser. "No" does nothing.
deleteBinderDialog.addEventListener('close', async () => {
  const id = deletingId;
  deletingId = null;
  if (deleteBinderDialog.returnValue !== 'yes' || !id) return;
  shelfMessage.classList.remove('error');
  shelfMessage.textContent = 'Deleting…';
  try {
    await trashBinderFile(id);
    forgetBinder(id);                 // binder-storage.js
    renderShelf(loadBinderList());
    shelfMessage.textContent = '';
  } catch (err) {
    if (err.signedOut) { showSignedOut(err.message); return; }
    shelfMessage.classList.add('error');
    shelfMessage.textContent = `Couldn't delete the binder. ${err.message}`;
  }
});
closeOnBackdropClick(deleteBinderDialog);

/* =====================================================================
   STARTUP — everything that runs once when the page opens
   ===================================================================== */

// Get Google's sign-in ready, so the button can open Google's window
// straight away when clicked. If it can't load, say why under the button.
initGoogleSignIn().catch((err) => {
  if (signedOutView.hidden === false) signInMessage.textContent = err.message;
});

// Already signed in (earlier in this browser tab)? Go straight to the
// binders. Otherwise show the sign-in screen. If the Google Client ID
// hasn't been added yet, explain that instead of offering a broken button.
if (isSignedIn()) {
  showSignedIn();
} else if (!googleIsConfigured()) {
  showSignedOut('Google sign-in isn\'t set up yet: the Google Client ID still needs to be added to google-drive.js.');
  signInButton.disabled = true;
} else {
  showSignedOut();
}
