/* =========================================================================
   BINDER STORAGE
   Shared by index.html (the landing page), binder.html (a binder) and
   cardsearch.html (the card search), so they all agree on how many pockets
   there are and where each binder's cards are kept.

   Each binder's real home is a file in the user's Google Drive (see
   google-drive.js). This file keeps a WORKING COPY of each binder in the
   browser's "localStorage" (a small storage area each website gets on your
   computer), so pages open instantly and keep working even when the Google
   connection has expired. A "needs saving" marker remembers which binders
   have changes that haven't reached Google Drive yet.
   ========================================================================= */

// How many pages a binder has, and how many pockets on each page (4 x 4).
// Change these numbers here to resize the binders; every page uses them.
const TOTAL_PAGES = 10;
const POCKETS_PER_PAGE = 16;

// The names things are saved under in localStorage:
//  - binderCards:<id>  one binder's cards (<id> is its Google Drive file id)
//  - binderDirty:<id>  set when that binder has changes not yet in Drive
//  - binderList        the list of the user's binders: [{ id, name, color }, ...]
//  - lastBinderId      the binder opened most recently
const CARDS_KEY_PREFIX = 'binderCards:';
const DIRTY_KEY_PREFIX = 'binderDirty:';
const BINDER_LIST_KEY = 'binderList';
const LAST_BINDER_KEY = 'lastBinderId';

// Before there were several binders, the one binder was saved under this
// name. The landing page moves those cards into the user's first binder.
const OLD_SINGLE_BINDER_KEY = 'binderCards';

// The name written into binder files, so we can recognize our own files.
const FILE_APP_NAME = 'mtg-card-binder';

// Magic's color symbols, for a binder's cover. Each has the one-letter code
// Magic uses (U is blue, because B is black), a name, and its symbol
// picture from Scryfall (the same place the card pictures come from).
const MANA_COLORS = [
  { code: 'W', name: 'White',     symbol: 'https://svgs.scryfall.io/card-symbols/W.svg' },
  { code: 'U', name: 'Blue',      symbol: 'https://svgs.scryfall.io/card-symbols/U.svg' },
  { code: 'B', name: 'Black',     symbol: 'https://svgs.scryfall.io/card-symbols/B.svg' },
  { code: 'R', name: 'Red',       symbol: 'https://svgs.scryfall.io/card-symbols/R.svg' },
  { code: 'G', name: 'Green',     symbol: 'https://svgs.scryfall.io/card-symbols/G.svg' },
  { code: 'C', name: 'Colorless', symbol: 'https://svgs.scryfall.io/card-symbols/C.svg' }
];

// Find a color by its code ("U" → the Blue entry), or null if the code
// isn't one of the six (including no color at all).
function manaColor(code) {
  return MANA_COLORS.find((c) => c.code === code) || null;
}

// Each pocket has a short name like "3-5" (page 3, pocket 5),
// used to look up which card is in it.
function pocketKey(page, slot) {
  return `${page}-${slot}`;
}

// Small safe wrappers around localStorage: some browsers (for example some
// private windows) block it, and then these quietly do nothing.
function storageGet(key) {
  try { return localStorage.getItem(key); } catch (e) { return null; }
}
function storageSet(key, value) {
  try { localStorage.setItem(key, value); return true; } catch (e) { return false; }
}
function storageRemove(key) {
  try { localStorage.removeItem(key); } catch (e) { /* blocked: nothing to do */ }
}

// Which binder this page is showing: the "binder=..." part of the address,
// e.g. binder.html?binder=1AbC... (null if the address doesn't say).
function currentBinderId() {
  return new URLSearchParams(location.search).get('binder');
}

// Read one binder's saved cards. Returns an object like:
//   { "3-5": { name, set, number, face, image }, ... }
// If nothing is saved yet (or storage is blocked), it's empty.
function loadBinder(id = currentBinderId()) {
  if (!id) return {};
  try {
    return JSON.parse(storageGet(CARDS_KEY_PREFIX + id)) || {};
  } catch (e) {
    return {};
  }
}

// Save one binder's cards. Normally this also marks the binder as
// "needs saving to Google Drive" (pass { dirty: false } when the cards just
// CAME from Drive). Returns false if storage is blocked, so pages can say so.
function saveBinder(cards, id = currentBinderId(), { dirty = true } = {}) {
  if (!id) return false;
  if (!storageSet(CARDS_KEY_PREFIX + id, JSON.stringify(cards))) return false;
  // The marker holds the time of the change, so a save to Drive that
  // started earlier can tell whether newer changes have happened since.
  if (dirty) storageSet(DIRTY_KEY_PREFIX + id, String(Date.now()));
  return true;
}

// The "needs saving" marker for a binder: a time, or null if it's saved.
function binderDirtyStamp(id) {
  return storageGet(DIRTY_KEY_PREFIX + id);
}

// Clear the "needs saving" marker, but only if no newer change has been
// made since the save to Drive began (that's what "stamp" checks).
function markBinderSaved(id, stamp) {
  if (binderDirtyStamp(id) === stamp) storageRemove(DIRTY_KEY_PREFIX + id);
}

// The list of the user's binders, as last seen: [{ id, name }, ...].
function loadBinderList() {
  try { return JSON.parse(storageGet(BINDER_LIST_KEY)) || []; } catch (e) { return []; }
}
function saveBinderList(list) {
  storageSet(BINDER_LIST_KEY, JSON.stringify(list));
}

// A binder's name from that list (or "Binder" if it isn't listed).
function binderName(id) {
  const found = loadBinderList().find((b) => b.id === id);
  return found ? found.name : 'Binder';
}

// A binder's cover color code from that list ("U" etc.), or null for none.
function binderColor(id) {
  const found = loadBinderList().find((b) => b.id === id);
  return found && manaColor(found.color) ? found.color : null;
}

// The whole binder as it's written to a Google Drive file (or a .JSON
// download): a little label saying what it is, its name, its cover
// color, and its cards.
function binderFileData(id) {
  return {
    app: FILE_APP_NAME,
    version: 1,
    name: binderName(id),
    color: binderColor(id),
    savedAt: new Date().toISOString(),
    cards: loadBinder(id)
  };
}

// Forget one binder kept in this browser (after it's deleted).
function forgetBinder(id) {
  storageRemove(CARDS_KEY_PREFIX + id);
  storageRemove(DIRTY_KEY_PREFIX + id);
  saveBinderList(loadBinderList().filter((b) => b.id !== id));
  if (storageGet(LAST_BINDER_KEY) === id) storageRemove(LAST_BINDER_KEY);
}

// Forget every binder saved in this browser (used when signing out, so the
// next person on this computer doesn't see them).
function clearAllBinders() {
  for (const binder of loadBinderList()) {
    storageRemove(CARDS_KEY_PREFIX + binder.id);
    storageRemove(DIRTY_KEY_PREFIX + binder.id);
  }
  storageRemove(BINDER_LIST_KEY);
  storageRemove(LAST_BINDER_KEY);
}

// Find the first empty pocket, going page by page, pocket by pocket.
// Returns { page, slot }, or null if every pocket already holds a card.
function firstEmptyPocket(cards) {
  for (let page = 1; page <= TOTAL_PAGES; page++) {
    for (let slot = 1; slot <= POCKETS_PER_PAGE; slot++) {
      if (!cards[pocketKey(page, slot)]) return { page, slot };
    }
  }
  return null;
}

// Check one card that came from outside (an uploaded file, or a Drive file
// that might have been edited). We only accept cards that have everything a
// pocket needs, with the picture coming from a secure "https://" address.
function isValidCard(card) {
  return card !== null && typeof card === 'object' &&
    typeof card.name === 'string' &&
    typeof card.set === 'string' &&
    typeof card.number === 'string' &&
    typeof card.image === 'string' && card.image.startsWith('https://') &&
    (card.face === 0 || card.face === 1) &&
    (card.lang === undefined || typeof card.lang === 'string');
}

// Keep only the valid cards in pockets that exist (like "3-5").
// Returns { cards, skipped } where "skipped" counts what was thrown away.
function cleanCards(incoming) {
  const cards = {};
  let skipped = 0;
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
    return { cards, skipped };
  }
  for (const [key, card] of Object.entries(incoming)) {
    const match = /^(\d+)-(\d+)$/.exec(key);
    const page = match ? Number(match[1]) : 0;
    const slot = match ? Number(match[2]) : 0;
    const pocketExists = page >= 1 && page <= TOTAL_PAGES && slot >= 1 && slot <= POCKETS_PER_PAGE;
    if (pocketExists && isValidCard(card)) cards[pocketKey(page, slot)] = card;
    else skipped++;
  }
  return { cards, skipped };
}
