/* =========================================================================
   landing.js — all the code that makes index.html (the landing page) work:
   the light/dark switch, signing in with Google (or skipping it to use
   the app locally, on this device only), and the shelf of binders
   (open one; make a new one with the "+" binder, with a name and a Magic
   symbol for its cover; drag binders to reorder them, or onto the pencil
   to edit them or the red X to delete them).
   It's loaded at the bottom of index.html, after binder-storage.js,
   google-drive.js and binder-dialog.js (which it uses).
   ========================================================================= */

/* =====================================================================
   FINDING THE PAGE ELEMENTS
   ===================================================================== */

const root           = document.documentElement;   // the <html> tag
const themeSwitch    = document.getElementById('themeSwitch');
const signedOutView  = document.getElementById('signedOutView');
const signInButton   = document.getElementById('signInButton');
const skipLoginButton = document.getElementById('skipLoginButton');   // "Skip login, local use only"
const signInMessage  = document.getElementById('signInMessage');
const signedInView   = document.getElementById('signedInView');
const accountName    = document.getElementById('accountName');
const footerSignOut  = document.getElementById('footerSignOut');
const myBindersItem  = document.getElementById('myBindersItem');   // the footer's "My Binders" link
const helpItem       = document.getElementById('helpItem');        // the footer's "Help" link
const binderShelf    = document.getElementById('binderShelf');
const shelfMessage   = document.getElementById('shelfMessage');
const editBinderDialog   = document.getElementById('editBinderDialog');
const editColorChoices   = document.getElementById('editColorChoices');
const editCoverChoices   = document.getElementById('editCoverChoices');   // Properties: cover colors
const binderNameInput    = document.getElementById('binderNameInput');
const nameCount          = document.getElementById('nameCount');
const deleteBinderDialog = document.getElementById('deleteBinderDialog');
const deleteBinderText   = document.getElementById('deleteBinderText');
const editDropZone       = document.getElementById('editDropZone');
const deleteDropZone     = document.getElementById('deleteDropZone');
const binderPagesInput   = document.getElementById('binderPagesInput');   // Properties: Pages box
const pagesNote          = document.getElementById('pagesNote');          // ...and the note beside it

/* =====================================================================
   SMALL HELPERS
   ===================================================================== */

// Show a message under the shelf ("Loading your binders…", or a problem
// in red when isError is true). An empty message clears it.
function setShelfMessage(text, isError = false) {
  shelfMessage.textContent = text;
  shelfMessage.classList.toggle('error', isError);
}

// "1 card", "5 cards": the count with "card" or "cards" to match.
function cardCountText(count) {
  return `${count} card${count === 1 ? '' : 's'}`;
}

/* =====================================================================
   LIGHT / DARK MODE
   ===================================================================== */

// Apply a theme ('light' or 'dark'), update the switch, and remember it.
function setTheme(theme) {
  root.setAttribute('data-theme', theme);
  themeSwitch.setAttribute('aria-checked', String(theme === 'dark'));
  storageSet('theme', theme);   // binder-storage.js (ignores blocked storage)
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
  helpItem.hidden = true;        // Help is for the binder pages, shown with them
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

// "Skip login, local use only": use the app without signing in, with the
// binders saved on this device only.
// If this browser still has binders from someone's Google account (their
// sign-in ran out but they never signed out), those belong in Drive, not
// here: forget them first (asking before losing changes not yet saved to
// Drive), so they don't get mixed in with the local binders.
skipLoginButton.addEventListener('click', () => {
  const leftover = loadBinderList();
  if (leftover.some((b) => binderDirtyStamp(b.id)) &&
      !confirm('This browser has binder changes that haven\'t been saved to Google Drive yet. ' +
               'Using the app locally will forget them. Continue?')) {
    return;
  }
  clearAllBinders();     // binder-storage.js
  setLocalMode(true);
  showLocalOnly();
});

// The link at the bottom right (google-drive.js does the work):
//  - "Sign out" (saving, signing out and forgetting): afterwards, show the
//    sign-in screen.
//  - "Sign in with Google" when using the app locally (signing in, then
//    uploading the local binders to Drive): afterwards, show the binders
//    from Drive, the uploaded ones included.
setUpFooterSignOut(() => showSignedOut('You\'re signed out.'), () => showSignedIn());

/* =====================================================================
   THE SHELF OF BINDERS
   ===================================================================== */

// Show the shelf using the app locally (no sign-in): the binders saved on
// this device. Everything works the same as when signed in (the Drive
// steps in google-drive.js just skip Drive), and "Sign in with Google" at
// the bottom right uploads them to Drive.
function showLocalOnly() {
  signedOutView.hidden = true;
  signedInView.hidden = false;
  myBindersItem.hidden = false;   // show the "My Binders" link
  helpItem.hidden = false;        // and the "Help" link
  showFooterAccountLink();       // and "Sign in with Google" (google-drive.js)
  accountName.textContent = 'Saved on this device only';
  renderShelf(loadBinderList());
  setShelfMessage('');
}

// Show the signed-in view: who's signed in, and their binders. The
// binders this browser already knows about appear straight away, then
// the shelf is refreshed from Google Drive.
async function showSignedIn() {
  signedOutView.hidden = true;
  signedInView.hidden = false;
  showFooterAccountLink();        // show "Sign out" at the bottom right (google-drive.js)
  myBindersItem.hidden = false;   // and the "My Binders" link
  helpItem.hidden = false;        // and the "Help" link
  renderShelf(loadBinderList());
  setShelfMessage('Loading your binders…');

  try {
    // Who's signed in (shown above the shelf).
    const user = await getDriveUser();
    accountName.textContent = `Signed in as ${user.displayName || user.emailAddress}`;

    // The binder files in their Drive (oldest first), with each one's cover
    // symbol, cover color, number of pages and shelf position (labels stored
    // on the file; an unknown symbol counts as none, no cover color means
    // black, and no page count means DEFAULT_PAGES).
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

    // Put them in the order the user arranged them. Binders without a saved
    // position (made before positions were saved) go after the others, oldest
    // first. ("sort" keeps the oldest-first order among equal positions.)
    binders.sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));
    binders = binders.map(({ id, name, color, cover, pages }) => ({ id, name, color, cover, pages }));

    // First time signing in? If this browser still has cards from before
    // binders were saved in Drive, move them into a first binder.
    if (binders.length === 0) binders = await moveOldCardsIntoFirstBinder();

    // Bring each binder up to date between this browser and Drive (all at
    // once), which also gives us each binder's card count.
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

// If cards from the old single binder are still in this browser, put them
// into a new "Binder 1" in Drive and forget the old copy. Returns the list
// of binders (with that one in it, or empty if there was nothing to move).
async function moveOldCardsIntoFirstBinder() {
  let oldCards = {};
  try { oldCards = JSON.parse(storageGet(OLD_SINGLE_BINDER_KEY)) || {}; } catch (e) { /* unreadable */ }
  const { cards } = cleanCards(oldCards);
  if (Object.keys(cards).length === 0) return [];

  const name = 'Binder 1';
  const file = await createBinderFile(name, cards);
  saveBinder(cards, file.id, { dirty: false });
  storageRemove(OLD_SINGLE_BINDER_KEY);
  return [{ id: file.id, name, color: null, cover: DEFAULT_COVER, pages: DEFAULT_PAGES }];
}

// Draw the shelf: a closed binder for each binder (a link that opens it),
// then the "+" binder for making a new one.
function renderShelf(binders) {
  // Was the keyboard on the shelf? Redrawing replaces every binder, so the
  // keyboard is put back afterwards (see USING THE KEYBOARD).
  const keyboardWasHere = binderShelf.contains(document.activeElement);
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
    const coverWords = `, ${coverColorName(binder.cover)} cover`;
    tile.setAttribute('aria-label', `Open ${binder.name}${coverWords}${colorWords}, ${cardCountText(count)}`);
    tile.append(closedBinder(binder.name, binder.color, binder.cover), caption(cardCountText(count)));

    // The binder and its small download button share one spot on the
    // shelf. (A button can't go inside the binder's link, so they sit side
    // by side in a holder, and landing.css places the button at the right
    // end of the card count line.)
    const slot = document.createElement('div');
    slot.className = 'binder-slot';
    slot.append(tile, downloadButton(binder));
    binderShelf.appendChild(slot);
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
  // Clicking it opens the New binder window (binder-dialog.js); "Create
  // binder" there runs makeNewBinder below.
  addTile.addEventListener('click', () => openNewBinderDialog(makeNewBinder));
  binderShelf.appendChild(addTile);

  fitCoverLabels();
  setShelfTabStop(keyboardWasHere);   // see USING THE KEYBOARD
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
// color's symbol goes in the center of the cover. "coverCode" is the cover's
// color ("gold", or a custom "#3a7bd5"), colored by applyCoverColor
// (binder-dialog.js). Left out (like the "+" binder), it's black.
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
   DOWNLOADING A BINDER AS A .JSON FILE
   The small down-arrow button under each binder saves that binder as a
   .json file: its name, cover symbol, cover color, pages and cards, in
   the same layout as its file in Google Drive (see binderFileData in
   binder-storage.js). "Upload .JSON" in the New binder window turns
   one of these files back into a binder.
   ===================================================================== */

// Build the download button for one binder: a down arrow, with its name
// for screen readers and as a tooltip.
function downloadButton(binder) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'binder-download';
  button.title = `Download ${binder.name} as .JSON`;
  button.setAttribute('aria-label', `Download ${binder.name} as a .JSON file`);
  button.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>';
  button.addEventListener('click', () => downloadBinder(binder.id, button));
  // For the mouse and fingers: the Tab key skips it, since keyboard users
  // press D on the binder instead (see USING THE KEYBOARD).
  button.tabIndex = -1;
  return button;
}

// Save one binder as a .json file. When signed in, get its latest cards
// from Google Drive first (it may have been changed on another computer);
// if that isn't possible right now, use this browser's copy.
async function downloadBinder(id, button) {
  button.disabled = true;
  if (!isLocalMode()) {
    try { await syncBinder(id); } catch (err) { /* use this browser's copy */ }
  }
  button.disabled = false;

  // JSON.stringify writes the binder as text; the "2" adds indenting so the
  // file is easy to read in a text editor.
  const data = binderFileData(id);   // binder-storage.js
  const file = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  // The browser saves files from a link, so make an invisible link to the
  // file's contents, "click" it, then clean up.
  const link = document.createElement('a');
  link.href = URL.createObjectURL(file);
  // e.g. "Binder 1 2026-10-16.json" (characters not allowed in file names removed)
  const safeName = data.name.replace(/[\\/:*?"<>|]/g, '');
  link.download = `${safeName} ${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);   // free the memory the file was using
}

/* =====================================================================
   UPLOADING A BINDER FROM A .JSON FILE
   "Upload .JSON" in the New binder window opens the file picker. A
   binder file (from the download button above) becomes a new binder at
   the end of the shelf, with the file's name, cover symbol, cover color,
   pages and cards. If a binder with that name already exists, the new
   one is called "Name (1)", then "Name (2)", and so on.
   ===================================================================== */

const uploadBinderButton = document.getElementById('uploadBinderButton');
const uploadBinderInput  = document.getElementById('uploadBinderInput');

// Clicking "Upload .JSON" opens the (hidden) file picker.
uploadBinderButton.addEventListener('click', () => uploadBinderInput.click());

// A file was picked: read it, check it, and make the binder.
uploadBinderInput.addEventListener('change', async () => {
  const chosen = uploadBinderInput.files[0];
  uploadBinderInput.value = '';     // so picking the same file again still works
  if (!chosen) return;              // the picker was closed without a file

  let binder;
  try {
    binder = binderFromFile(JSON.parse(await chosen.text()));
  } catch (err) {
    // Not a binder file: say why, and leave the New binder window open.
    alert(err instanceof SyntaxError ? 'That file isn\'t a readable .JSON file.' : err.message);
    return;
  }
  newBinderDialog.close('upload');   // not "create", so no empty binder is made
  addUploadedBinder(binder);
});

// Check a binder file's data and pull out what the new binder needs.
// Throws an error with a message to show if it isn't a binder file.
function binderFromFile(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data) ||
      !data.cards || typeof data.cards !== 'object' || Array.isArray(data.cards) ||
      (data.app !== undefined && data.app !== FILE_APP_NAME)) {
    throw new Error('That file isn\'t an MTG Card Binder binder file.');
  }

  // Keep only the valid cards in pockets that can exist (cleanCards is in
  // binder-storage.js); "skipped" counts any that were thrown away.
  const { cards, skipped } = cleanCards(data.cards);
  const count = Object.keys(cards).length;

  // Enough pages for the file's page count, for its cards, and for the
  // highest page a card is on (never more than MAX_PAGES).
  const highestPage = Math.max(0, ...Object.keys(cards).map((key) => Number(key.split('-')[0])));
  const pages = Math.min(MAX_PAGES,
    Math.max(cleanPageCount(data.pages), minPagesFor(count), highestPage));

  const name = typeof data.name === 'string' && data.name.trim() ? data.name.trim() : nextBinderName();
  return {
    name: freeBinderName(name),
    color: manaColor(data.color) ? data.color : null,   // an unknown symbol counts as none
    cover: cleanCover(data.cover),                       // an unknown color counts as black
    pages,
    cards,
    skipped
  };
}

// The name for an uploaded binder: its own name if no binder has it yet.
// Otherwise "Name (1)", or "(2)" if that's taken too, and so on. (A name
// that already ends in "(3)" counts up from its plain name, so copies of
// "Red (1)" are "Red (2)", "Red (3)" and so on.) Names keep to the
// 12-character limit (so they fit on the cover), shortening the plain
// name to make room for the number when needed.
function freeBinderName(name) {
  const NAME_LIMIT = 12;
  const taken = new Set(loadBinderList().map((b) => b.name.toLowerCase()));
  name = name.slice(0, NAME_LIMIT);
  if (!taken.has(name.toLowerCase())) return name;

  const plain = name.replace(/\s*\(\d+\)$/, '');
  for (let number = 1; ; number++) {
    const ending = ` (${number})`;
    const candidate = plain.slice(0, NAME_LIMIT - ending.length).trimEnd() + ending;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

// Make the uploaded binder: a new binder file in Google Drive (or on this
// device, when used locally) with all its details and cards, added to the
// end of the shelf.
async function addUploadedBinder({ name, color, cover, pages, cards, skipped }) {
  const binders = loadBinderList();
  const addTile = document.getElementById('addBinderTile');
  if (addTile) addTile.disabled = true;
  setShelfMessage(`Adding ${name}…`);

  try {
    const file = await createBinderFile(name, cards, color, binders.length, cover, pages);   // google-drive.js
    saveBinder(cards, file.id, { dirty: false });   // Drive already has these cards
    binders.push({ id: file.id, name, color, cover, pages });
    saveBinderList(binders);
    renderShelf(binders);
    const count = Object.keys(cards).length;
    setShelfMessage(`✓ Added ${name} with ${cardCountText(count)}` +
      (skipped > 0 ? ` (${skipped} unreadable entr${skipped === 1 ? 'y' : 'ies'} skipped).` : '.'));
  } catch (err) {
    if (err.signedOut) { showSignedOut(err.message); return; }
    if (addTile) addTile.disabled = false;
    setShelfMessage(`Couldn't add the binder to Google Drive. ${err.message}`, true);
  }
}

/* =====================================================================
   MAKING A NEW BINDER
   (the New binder window itself is in binder-dialog.js, shared with the
   card finder page)
   ===================================================================== */

// Make a new, empty binder file in Google Drive with the chosen name,
// cover symbol and cover color, and add it to the end of the shelf.
async function makeNewBinder(name, color, cover) {
  const binders = loadBinderList();
  const addTile = document.getElementById('addBinderTile');
  if (addTile) addTile.disabled = true;
  setShelfMessage('Making a new binder…');

  try {
    // The new binder goes at the end of the shelf (its position = how many
    // binders came before it).
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
  setShelfMessage('Saving the new order…');
  try {
    await Promise.all(binders.map((b, index) => updateBinderDetails(b.id, { order: index })));
    setShelfMessage('');
  } catch (err) {
    if (err.signedOut) { showSignedOut(err.message); return; }
    setShelfMessage(`Couldn't save the new order to Google Drive. ${err.message}`, true);
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

// The binder being edited (its id) while the window is open.
let editingId = null;

// Fill the window's symbol choices (the same set as the New binder window).
buildColorChoices(editColorChoices, 'editColor');
// ...and its cover color choices.
buildCoverChoices(editCoverChoices, 'editCover');

// Keep the "5 / 12" counter next to the name box up to date
// (showNameCount is shared with the New binder window).
binderNameInput.addEventListener('input', () => showNameCount(binderNameInput, nameCount));

// Open the window for a binder, filled in with its current name, number of
// pages, symbol and cover color. The Pages box can't go below the fewest pages its
// cards need, or above the MAX_PAGES (150) limit.
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
  setPickedCoverColor(editCoverChoices, binder.cover);   // binder-dialog.js
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
  const name = binderNameInput.value.trim().slice(0, binderNameInput.maxLength);
  if (!name) return;
  const picked = editBinderDialog.querySelector('input[name="editColor"]:checked');
  const color = picked && picked.value ? picked.value : null;
  const cover = pickedCoverColor(editCoverChoices);   // binder-dialog.js
  // The page count, kept within the limits just in case (cleanPageCount
  // caps it at MAX_PAGES; this keeps it at or above the smallest allowed).
  let pages = Math.max(cleanPageCount(binderPagesInput.value), Number(binderPagesInput.min));
  const oldPages = binderPages(id);

  // Show the change straight away...
  const binders = loadBinderList();
  const binder = binders.find((b) => b.id === id);
  if (!binder) return;
  binder.name = name;
  binder.color = color;
  binder.cover = cover;
  binder.pages = pages;
  saveBinderList(binders);
  renderShelf(binders);

  // ...then save it to Drive (renaming the file and setting its labels).
  setShelfMessage('Saving…');
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
    await updateBinderDetails(id, { name, color, cover, pages });
    setShelfMessage('');
  } catch (err) {
    if (err.signedOut) { showSignedOut(err.message); return; }
    setShelfMessage(`Couldn't save the changes to Google Drive. ${err.message}`, true);
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
  // Signed in, it goes to the Drive trash; used locally, it's gone for good.
  deleteBinderText.textContent =
    `"${binder.name}" and its ${cardCountText(count)} will be deleted. ` +
    (isLocalMode()
      ? 'It\'s only saved on this device, so it can\'t be brought back.'
      : 'It goes to your Google Drive trash, where it can be restored for 30 days.');
  deleteBinderDialog.returnValue = '';   // forget last time's answer (see openEditDialog)
  deleteBinderDialog.showModal();
}

// "Yes, delete": move the binder's file to the Drive trash (nothing to do
// there when used locally), then take it off the shelf and out of this
// browser. "No" does nothing.
deleteBinderDialog.addEventListener('close', async () => {
  const id = deletingId;
  deletingId = null;
  if (deleteBinderDialog.returnValue !== 'yes' || !id) return;
  setShelfMessage('Deleting…');
  try {
    await trashBinderFile(id);
    forgetBinder(id);                 // binder-storage.js
    renderShelf(loadBinderList());
    setShelfMessage('');
  } catch (err) {
    if (err.signedOut) { showSignedOut(err.message); return; }
    setShelfMessage(`Couldn't delete the binder. ${err.message}`, true);
  }
});
closeOnBackdropClick(deleteBinderDialog);

/* =====================================================================
   USING THE KEYBOARD
   Everything the mouse does to binders on the shelf can also be done
   with keys. Press Tab to get onto the shelf (it lands on one binder),
   then:
     Arrow keys   move from binder to binder (← → along a row, ↑ ↓
                  between rows, however many fit across the screen).
                  The "+" New binder spot is the last stop.
     Home / End   the first binder / the "+" New binder spot
     Enter        open the binder (or, on "+", the New binder window)
     Space        pick the binder up to move it: the arrow keys choose
                  its new spot (a dashed outline shows it), Space or
                  Enter drops it there (the binders in between shift
                  along, like dragging), and Escape puts it back
     E            Binder properties (like dropping it on the pencil)
     Delete       delete the binder (it asks first)
     D            download the binder as a .JSON file
     N            the New binder window, from any binder
     ?            (anywhere on the page) the Keyboard shortcuts window
   A small guide at the top of the page shows the keys while the keyboard
   is on the shelf, and each step is read out by screen readers through a
   hidden message area (#shelfAnnouncer in index.html).
   ===================================================================== */

const keyboardHint   = document.getElementById('keyboardHint');    // the visible key guide
const shelfAnnouncer = document.getElementById('shelfAnnouncer');  // read out by screen readers

// The spot on the shelf the keyboard is on: a binder's id, or "add" for
// the "+" New binder spot. Only that spot can be reached with the Tab key
// (tabIndex 0; every other spot has -1), so Tab goes onto the shelf ONCE
// and the arrow keys move around on it. "shelfKeyIndex" remembers its
// position too, so if that binder is deleted the keyboard lands on the
// one that takes its place.
let shelfKeyId = null;
let shelfKeyIndex = 0;

// The binder being moved with the keyboard: { id }, or null.
let carryingBinder = null;

// True after E, Delete or N opened a window from the keyboard, so the
// keyboard goes back to the shelf when that window closes.
let keyboardOpenedWindow = false;

// Every spot on the shelf in order: each binder, then the "+" spot.
function shelfStops() {
  return [...binderShelf.querySelectorAll('a.binder-tile, #addBinderTile')];
}

// The id of a spot: the binder's id, or "add" for the "+" spot.
function stopId(stop) {
  return stop.id === 'addBinderTile' ? 'add' : stop.dataset.id;
}

// Make the keyboard's spot the one the Tab key reaches (and only that
// one). If its binder is gone (deleted), use the spot now in its place.
// "focus" true also moves the keyboard there. Called by renderShelf after
// every redraw, and by the arrow keys.
function setShelfTabStop(focus = false) {
  const stops = shelfStops();
  if (stops.length === 0) return;
  let index = stops.findIndex((stop) => stopId(stop) === shelfKeyId);
  if (index < 0) index = Math.min(shelfKeyIndex, stops.length - 1);
  stops.forEach((stop, i) => { stop.tabIndex = i === index ? 0 : -1; });
  shelfKeyId = stopId(stops[index]);
  shelfKeyIndex = index;
  if (focus) stops[index].focus();
}

// Say something to screen readers. (Emptying the area first makes a
// screen reader read the message even if it's the same as the last one.)
function announce(text) {
  shelfAnnouncer.textContent = '';
  setTimeout(() => { shelfAnnouncer.textContent = text; }, 50);
}

// How many spots fit across one row of the shelf right now: the spots
// sitting at the same height as the first one.
function shelfColumns(stops) {
  const top = Math.round(stops[0].getBoundingClientRect().top);
  return stops.filter((stop) => Math.round(stop.getBoundingClientRect().top) === top).length;
}

// The binder's name for announcements, e.g. "Red".
function binderNameOf(id) {
  const found = loadBinderList().find((b) => b.id === id);
  return found ? found.name : 'Binder';
}

// Go to the spot at a position on the shelf. While moving a binder, the
// dashed "goes here" outline moves with it.
function goToStop(index) {
  const stops = shelfStops();
  shelfKeyIndex = index;
  shelfKeyId = stopId(stops[index]);
  setShelfTabStop(true);
  if (carryingBinder) {
    stops.forEach((stop) => stop.classList.remove('drop-target'));
    if (shelfKeyId !== carryingBinder.id) stops[index].classList.add('drop-target');
    const binderCount = stops.length - 1;   // not counting the "+" spot
    announce(shelfKeyId === carryingBinder.id
      ? `Back at spot ${index + 1} of ${binderCount}, where it started.`
      : `Spot ${index + 1} of ${binderCount}, where ${binderNameOf(shelfKeyId)} is now.`);
  }
  updateKeyboardHint();
}

// An arrow key (or Home / End): work out the spot to go to. Up and down
// jump a whole row; down from a row above the last one, with nothing
// right below, goes to the last spot. While moving a binder, the "+" spot
// is skipped (a binder can't go after it).
function arrowToStop(key) {
  const stops = shelfStops();
  const last = carryingBinder ? stops.length - 2 : stops.length - 1;
  const columns = shelfColumns(stops);
  const here = stops.findIndex((stop) => stopId(stop) === shelfKeyId);
  let next = here;
  if (key === 'ArrowLeft') next = here - 1;
  if (key === 'ArrowRight') next = here + 1;
  if (key === 'ArrowUp') next = here - columns >= 0 ? here - columns : here;
  if (key === 'ArrowDown') {
    const onLastRow = Math.floor(here / columns) === Math.floor(last / columns);
    next = onLastRow ? here : Math.min(here + columns, last);
  }
  if (key === 'Home') next = 0;
  if (key === 'End') next = last;
  goToStop(Math.max(0, Math.min(last, next)));
}

// Space on a binder: pick it up to move it. It fades, like a dragged one.
function pickUpBinder(id) {
  carryingBinder = { id };
  binderShelf.querySelector(`a.binder-tile[data-id="${id}"]`).classList.add('drag-source');
  announce(`Picked up ${binderNameOf(id)}. Use the arrow keys to choose its new spot, ` +
    'then Space to drop it, or Escape to cancel.');
  updateKeyboardHint();
}

// Stop moving: clear the faded binder and the dashed outline.
function stopCarryingBinder() {
  carryingBinder = null;
  binderShelf.querySelectorAll('.drag-source, .drop-target')
    .forEach((tile) => tile.classList.remove('drag-source', 'drop-target'));
  updateKeyboardHint();
}

// Space or Enter while moving: put the binder in the keyboard's spot,
// using the same moveBinder as dragging (which saves the new order). The
// keyboard stays on the moved binder.
function dropBinder() {
  const id = carryingBinder.id;
  const targetId = shelfKeyId;
  stopCarryingBinder();
  if (targetId === id) { announce(`${binderNameOf(id)} stays where it was.`); return; }
  shelfKeyId = id;
  moveBinder(id, targetId);
  const spot = loadBinderList().findIndex((b) => b.id === id) + 1;
  announce(`Moved ${binderNameOf(id)} to spot ${spot} of ${loadBinderList().length}.`);
}

// Escape (or Tab, or the mouse taking over) while moving: put it back.
function cancelCarryingBinder() {
  const id = carryingBinder.id;
  stopCarryingBinder();
  announce(`Cancelled. ${binderNameOf(id)} stays where it was.`);
}

// The key guide at the top of the page: which keys do what right now.
// It shows while the keyboard is on the shelf (or a binder is being
// moved), and hides otherwise. aria-hidden in index.html, since screen
// readers get the same help from the announcements.
function updateKeyboardHint() {
  const focused = document.activeElement;
  const onShelf = focused && binderShelf.contains(focused) &&
    focused.matches('a.binder-tile:focus-visible, #addBinderTile:focus-visible');
  if (carryingBinder) {
    keyboardHint.textContent = `Moving ${binderNameOf(carryingBinder.id)}: ` +
      '←↑↓→ choose a spot · Space or Enter drop · Esc cancel';
  } else if (onShelf && shelfKeyId === 'add') {
    keyboardHint.textContent = '←↑↓→ move · Enter new binder · Home / End first / last · ? all keys';
  } else if (onShelf) {
    keyboardHint.textContent = '←↑↓→ move · Enter open · Space pick up · E edit · ' +
      'Del delete · D download · N new binder · ? all keys';
  }
  keyboardHint.hidden = !(carryingBinder || onShelf);
}

// The keys, while the keyboard is on a spot of the shelf (not while
// dragging with the mouse, and not with Ctrl / Alt / ⌘ held, which belong
// to the browser).
binderShelf.addEventListener('keydown', (event) => {
  const stop = event.target.closest('a.binder-tile, #addBinderTile');
  if (!stop || drag) return;
  if (event.ctrlKey || event.altKey || event.metaKey) return;

  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
    event.preventDefault();              // don't scroll the page
    arrowToStop(event.key);
    return;
  }

  // While moving a binder: drop, cancel, or (Tab) give up and move on.
  if (carryingBinder) {
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();            // Enter mustn't open the binder here
      dropBinder();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancelCarryingBinder();
    } else if (event.key === 'Tab') {
      cancelCarryingBinder();            // the Tab still moves on as usual
    }
    return;
  }

  // N works on any spot: the New binder window.
  if (event.key === 'n' || event.key === 'N') {
    event.preventDefault();
    keyboardOpenedWindow = true;
    openNewBinderDialog(makeNewBinder);  // binder-dialog.js
    return;
  }

  // The rest only do something on a binder (on the "+" spot, Enter and
  // Space press it like a button, as usual). Enter on a binder is left
  // alone too, so it opens the binder like a click.
  if (stopId(stop) === 'add') return;
  const id = stop.dataset.id;
  if (event.key === ' ') {
    event.preventDefault();              // don't scroll the page
    pickUpBinder(id);
  } else if (event.key === 'e' || event.key === 'E') {
    event.preventDefault();
    keyboardOpenedWindow = true;
    openEditDialog(id);
  } else if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault();
    keyboardOpenedWindow = true;
    openDeleteDialog(id);
  } else if (event.key === 'd' || event.key === 'D') {
    event.preventDefault();
    downloadBinder(id, stop.parentElement.querySelector('.binder-download'));
    announce(`Downloading ${binderNameOf(id)}.`);
  }
});

// When the keyboard arrives on a spot (by Tab, arrows or a click), that
// spot becomes the keyboard's spot, and the key guide updates. When it
// leaves the shelf, the guide hides (checked a moment later, once the
// browser has settled where the focus went).
binderShelf.addEventListener('focusin', (event) => {
  const stop = event.target.closest('a.binder-tile, #addBinderTile');
  if (stop) {
    shelfKeyId = stopId(stop);
    shelfKeyIndex = shelfStops().indexOf(stop);
    setShelfTabStop();
  }
  updateKeyboardHint();
});
binderShelf.addEventListener('focusout', () => setTimeout(updateKeyboardHint, 0));

// Starting a mouse or finger drag while moving a binder with the keyboard:
// the keyboard's binder goes back first, so only one binder moves at a time.
binderShelf.addEventListener('pointerdown', () => { if (carryingBinder) cancelCarryingBinder(); }, true);

// After a window opened from the keyboard (E, Delete or N) closes, put the
// keyboard back on the shelf. (Saving redraws the shelf, so the browser's
// own "return focus" can land on a binder that's been replaced.)
// "setTimeout" waits until the window has closed and the shelf is redrawn.
for (const dialog of [editBinderDialog, deleteBinderDialog, newBinderDialog]) {
  dialog.addEventListener('close', () => {
    if (!keyboardOpenedWindow) return;
    keyboardOpenedWindow = false;
    setTimeout(() => setShelfTabStop(true), 0);
  });
}
// The ? key, anywhere on the page: open the Keyboard shortcuts window
// (#shortcutsDialog in index.html), which lists the keys above. Not while
// typing in a box (like a binder's name) or with another window open.
const shortcutsDialog = document.getElementById('shortcutsDialog');
document.addEventListener('keydown', (event) => {
  if (event.key !== '?' || event.ctrlKey || event.altKey || event.metaKey) return;
  if (event.target.closest('input, textarea, select')) return;
  if (document.querySelector('dialog[open]')) return;
  event.preventDefault();
  if (carryingBinder) cancelCarryingBinder();   // put a moving binder back first
  shortcutsDialog.showModal();
});
closeOnBackdropClick(shortcutsDialog);   // binder-dialog.js: a click outside closes it
/* =====================================================================
   STARTUP — everything that runs once when the page opens
   ===================================================================== */

// Get Google's sign-in ready, so the button can open Google's window
// straight away when clicked. If it can't load, say why under the button.
initGoogleSignIn().catch((err) => {
  if (signedOutView.hidden === false) signInMessage.textContent = err.message;
});

// Using the app locally (chosen earlier on this device)? Show the binders
// saved here. Already signed in (earlier in this browser tab)? Go straight
// to the binders. Otherwise show the sign-in screen. If the Google Client ID
// hasn't been added yet, explain that instead of offering a broken button.
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
