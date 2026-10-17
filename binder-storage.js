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

   LOCAL USE ONLY: someone can skip signing in ("Skip login, local use
   only" on the landing page). Then this browser's copy is the ONLY copy:
   the binders live just on this device, and nothing goes to Google Drive
   until they sign in (which uploads them; see uploadLocalBinders in
   google-drive.js).
   ========================================================================= */

// How many pockets on each page (4 x 4).
const POCKETS_PER_PAGE = 16;

// How many pages a binder has. Each binder has its own number of pages
// (changed in the Binder properties window on the My Binders page):
//  - DEFAULT_PAGES: what a new binder starts with
//  - MAX_PAGES:     the most a binder can have (150 pages = 2,400 cards).
//                   It's a "safe" limit: the binder page builds every
//                   pocket when it opens (and loads card pictures only near
//                   the page being looked at), and much bigger binders
//                   would make opening it slow.
// A binder can't have fewer pages than it needs for its cards (see
// minPagesFor).
const DEFAULT_PAGES = 10;
const MAX_PAGES = 150;

// The names things are saved under in localStorage:
//  - binderCards:<id>  one binder's cards (<id> is its Google Drive file id)
//  - binderDirty:<id>  set when that binder has changes not yet in Drive
//  - binderList        the list of the user's binders: [{ id, name, color, cover, pages }, ...]
//                      ("color" is the cover's symbol, "cover" the cover's color)
//  - lastBinderId      the binder opened most recently
//  - localOnly         "yes" while using the app without signing in
//                      (binders saved on this device only)
const CARDS_KEY_PREFIX = 'binderCards:';
const DIRTY_KEY_PREFIX = 'binderDirty:';
const BINDER_LIST_KEY = 'binderList';
const LAST_BINDER_KEY = 'lastBinderId';
const LOCAL_MODE_KEY = 'localOnly';

// Before there were several binders, the one binder was saved under this
// name. The landing page moves those cards into the user's first binder.
const OLD_SINGLE_BINDER_KEY = 'binderCards';

// The name written into binder files, so we can recognize our own files.
const FILE_APP_NAME = 'mtg-card-binder';

// Magic's color symbols, for a binder's cover. Each has:
//  - code:   the letters Magic uses (U is blue, because B is black);
//            two letters for a two-color symbol, e.g. "WU" = white and blue
//  - name:   the full name, read out by screen readers and shown on hover
//  - short:  the word shown under the symbol in the symbol choices
//  - group:  'single' (one color, colorless or planeswalker) or 'two' (two colors)
//  - symbol: its picture from Scryfall (where the card pictures come from)
// The two-color ones are Magic's "hybrid" symbols, one for each pair of
// colors. Their short names are the Magic guild names for those pairs
// (Azorius is white-blue, and so on), since "White-Blue" won't fit.
const SYMBOL_URL = 'https://svgs.scryfall.io/card-symbols/';
const MANA_COLORS = [
  { code: 'W',  name: 'White',     short: 'White',     group: 'single' },
  { code: 'U',  name: 'Blue',      short: 'Blue',      group: 'single' },
  { code: 'B',  name: 'Black',     short: 'Black',     group: 'single' },
  { code: 'R',  name: 'Red',       short: 'Red',       group: 'single' },
  { code: 'G',  name: 'Green',     short: 'Green',     group: 'single' },
  { code: 'C',  name: 'Colorless', short: 'Colorless', group: 'single' },
  // The planeswalker symbol (not a color, but a favorite for a binder cover).
  // It uses our own copy in the icons folder: Scryfall's is a black shape
  // with no circle, which would vanish on a black cover.
  { code: 'PW', name: 'Planeswalker', short: 'Planeswalker', group: 'single',
    symbol: 'icons/planeswalker.svg' },
  // Neighboring colors on Magic's color wheel ("allied" pairs)...
  { code: 'WU', name: 'White and Blue',  short: 'Azorius',  group: 'two' },
  { code: 'UB', name: 'Blue and Black',  short: 'Dimir',    group: 'two' },
  { code: 'BR', name: 'Black and Red',   short: 'Rakdos',   group: 'two' },
  { code: 'RG', name: 'Red and Green',   short: 'Gruul',    group: 'two' },
  { code: 'GW', name: 'Green and White', short: 'Selesnya', group: 'two' },
  // ...and colors across the wheel from each other ("enemy" pairs).
  { code: 'WB', name: 'White and Black', short: 'Orzhov',   group: 'two' },
  { code: 'UR', name: 'Blue and Red',    short: 'Izzet',    group: 'two' },
  { code: 'BG', name: 'Black and Green', short: 'Golgari',  group: 'two' },
  { code: 'RW', name: 'Red and White',   short: 'Boros',    group: 'two' },
  { code: 'GU', name: 'Green and Blue',  short: 'Simic',    group: 'two' }
// Each symbol's picture is Scryfall's, unless the entry names its own.
].map((color) => ({ ...color, symbol: color.symbol || `${SYMBOL_URL}${color.code}.svg` }));

// The colors a binder's cover can be (on the My Binders shelf). Each has a
// code (saved with the binder) and a name. The actual shades are in
// binder-dialog.css (the "cover-<code>" classes). "light: true" marks the
// pale covers, whose name label needs dark text. Black is what every
// binder starts as.
// Besides these, a cover can be ANY color picked with the device's own
// color chooser ("Custom"). That's saved as a color code like "#3a7bd5"
// (# then two digits each for red, green and blue, in "hexadecimal":
// 0-9 then a-f, so "00" is none and "ff" is full).
const COVER_COLORS = [
  { code: 'white',  name: 'White', light: true },
  { code: 'blue',   name: 'Blue' },
  { code: 'black',  name: 'Black' },
  { code: 'red',    name: 'Red' },
  { code: 'green',  name: 'Green' },
  { code: 'gold',   name: 'Gold', light: true },
  { code: 'gray',   name: 'Light gray', light: true },
  { code: 'purple', name: 'Purple' },
  { code: 'orange', name: 'Orange' }
];
const DEFAULT_COVER = 'black';

// Is this a custom cover color code, like "#3a7bd5"?
function isCustomCover(code) {
  return typeof code === 'string' && /^#[0-9a-f]{6}$/i.test(code);
}

// A cover color's code if it's one of the list above (or a custom color,
// made lowercase), otherwise black.
function cleanCover(code) {
  if (isCustomCover(code)) return code.toLowerCase();
  return COVER_COLORS.some((c) => c.code === code) ? code : DEFAULT_COVER;
}

// Find a color by its code ("U" → the Blue entry), or null if the code
// isn't in MANA_COLORS (including no color at all).
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

// The list of the user's binders, as last seen: [{ id, name, color, cover, pages }, ...].
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

// The next free default name for a new binder: the lowest "Binder N" not
// already used ("Binder 1", "Binder 2", ...).
function nextBinderName() {
  const used = new Set(loadBinderList().map((b) => b.name));
  let number = 1;
  while (used.has(`Binder ${number}`)) number++;
  return `Binder ${number}`;
}

// A binder's number of pages from that list (DEFAULT_PAGES if it doesn't say).
function binderPages(id) {
  const found = loadBinderList().find((b) => b.id === id);
  return found ? cleanPageCount(found.pages) : DEFAULT_PAGES;
}

// Turn any page count (a number, or text from a Drive label) into a safe
// whole number from 1 to MAX_PAGES. Anything unreadable becomes DEFAULT_PAGES (10).
function cleanPageCount(pages) {
  const number = Math.round(Number(pages));
  if (!Number.isFinite(number) || number < 1) return DEFAULT_PAGES;
  return Math.min(number, MAX_PAGES);
}

// The fewest pages that can hold this many cards (16 per page, at least 1).
// A binder can't be made smaller than this.
function minPagesFor(cardCount) {
  return Math.max(1, Math.ceil(cardCount / POCKETS_PER_PAGE));
}

// Fit a binder's cards into a new (smaller) number of pages: any card on a
// page that's going away moves into the first empty pocket on the pages
// that stay. Cards already on those pages don't move. Returns the new set
// of cards. (Only call this with at least minPagesFor(...) pages, so
// there's always room.)
function fitCardsIntoPages(cards, pages) {
  const kept = {};
  const homeless = [];
  for (const [key, card] of Object.entries(cards)) {
    const page = Number(key.split('-')[0]);
    if (page <= pages) kept[key] = card;
    else homeless.push([key, card]);
  }
  // Move the homeless cards in their old order (page by page, pocket by pocket).
  homeless.sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));
  for (const [, card] of homeless) {
    const spot = firstEmptyPocket(kept, pages);
    if (spot) kept[pocketKey(spot.page, spot.slot)] = card;
  }
  return kept;
}

// A binder's cover color from that list ("black" if it doesn't say).
function binderCover(id) {
  const found = loadBinderList().find((b) => b.id === id);
  return cleanCover(found && found.cover);
}

// A binder's cover color code from that list ("U" etc.), or null for none.
function binderColor(id) {
  const found = loadBinderList().find((b) => b.id === id);
  return found && manaColor(found.color) ? found.color : null;
}

// The whole binder as it's written to a Google Drive file (or a .JSON
// download): a little label saying what it is, its name, its cover
// symbol ("color") and cover color, its number of pages, and its cards.
function binderFileData(id) {
  return {
    app: FILE_APP_NAME,
    version: 1,
    name: binderName(id),
    color: binderColor(id),
    cover: binderCover(id),
    pages: binderPages(id),
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

/* ---------------------------------------------------------------------
   LOCAL USE ONLY (no Google sign-in)
   --------------------------------------------------------------------- */

// Is the app being used without signing in, with the binders saved on
// this device only?
function isLocalMode() {
  return storageGet(LOCAL_MODE_KEY) === 'yes';
}

// Turn "local use only" on (after "Skip login") or off (after signing in).
// It's kept in localStorage, so it's remembered next time on this device.
function setLocalMode(on) {
  if (on) storageSet(LOCAL_MODE_KEY, 'yes');
  else storageRemove(LOCAL_MODE_KEY);
}

// A new id for a binder kept on this device only (Google Drive gives the
// signed-in binders their ids). It starts with "local-" and adds the time
// and a few random letters, so no two are the same, e.g. "local-m1x2y3-k9q".
function newLocalBinderId() {
  return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

// Find the first empty pocket, going page by page, pocket by pocket, in a
// binder with this many pages. Returns { page, slot }, or null if every
// pocket already holds a card.
function firstEmptyPocket(cards, pages) {
  for (let page = 1; page <= pages; page++) {
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
    (card.lang === undefined || typeof card.lang === 'string') &&
    (card.count === undefined || (Number.isInteger(card.count) && card.count >= 1));
}

// How many copies of one card a pocket can say you own (the "− 3 +"
// counter on the binder page). 99 keeps the number to two digits, so it
// fits under even a small card on a phone.
const MAX_COPIES = 99;

// How many copies of a card you own. Cards saved before the counter
// existed have no "count", which means 1.
function cardCount(card) {
  return card && Number.isInteger(card.count) && card.count >= 1
    ? Math.min(card.count, MAX_COPIES)
    : 1;
}

// A copy of a card with a new number of copies. A count of 1 is left out
// of the card (it's the normal amount), which keeps saved files tidy.
function withCount(card, count) {
  const copy = { ...card };
  if (count > 1) copy.count = Math.min(count, MAX_COPIES);
  else delete copy.count;
  return copy;
}

// Are two cards the same printing: same set, collector number, face and
// language? Used when moving copies into a binder that already has that card.
function samePrinting(a, b) {
  return a.set === b.set && a.number === b.number && a.face === b.face &&
    (a.lang || 'en') === (b.lang || 'en');
}

// Keep only the valid cards in pockets that can exist (like "3-5", on any
// page up to the 150-page limit; the binder's own page count is checked
// where it's known). Returns { cards, skipped } where "skipped" counts what
// was thrown away.
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
    const pocketExists = page >= 1 && page <= MAX_PAGES && slot >= 1 && slot <= POCKETS_PER_PAGE;
    if (pocketExists && isValidCard(card)) cards[pocketKey(page, slot)] = card;
    else skipped++;
  }
  return { cards, skipped };
}
