const TOTAL_PAGES = 10;
const POCKETS_PER_PAGE = 16;

const CARDS_KEY_PREFIX = 'binderCards:';
const DIRTY_KEY_PREFIX = 'binderDirty:';
const BINDER_LIST_KEY = 'binderList';
const LAST_BINDER_KEY = 'lastBinderId';

const OLD_SINGLE_BINDER_KEY = 'binderCards';

const FILE_APP_NAME = 'mtg-card-binder';

const MANA_COLORS = [
  { code: 'W', name: 'White',     symbol: 'https://svgs.scryfall.io/card-symbols/W.svg' },
  { code: 'U', name: 'Blue',      symbol: 'https://svgs.scryfall.io/card-symbols/U.svg' },
  { code: 'B', name: 'Black',     symbol: 'https://svgs.scryfall.io/card-symbols/B.svg' },
  { code: 'R', name: 'Red',       symbol: 'https://svgs.scryfall.io/card-symbols/R.svg' },
  { code: 'G', name: 'Green',     symbol: 'https://svgs.scryfall.io/card-symbols/G.svg' },
  { code: 'C', name: 'Colorless', symbol: 'https://svgs.scryfall.io/card-symbols/C.svg' }
];

function manaColor(code) {
  return MANA_COLORS.find((c) => c.code === code) || null;
}

function pocketKey(page, slot) {
  return `${page}-${slot}`;
}

function storageGet(key) {
  try { return localStorage.getItem(key); } catch (e) { return null; }
}
function storageSet(key, value) {
  try { localStorage.setItem(key, value); return true; } catch (e) { return false; }
}
function storageRemove(key) {
  try { localStorage.removeItem(key); } catch (e) {  }
}

function currentBinderId() {
  return new URLSearchParams(location.search).get('binder');
}

function loadBinder(id = currentBinderId()) {
  if (!id) return {};
  try {
    return JSON.parse(storageGet(CARDS_KEY_PREFIX + id)) || {};
  } catch (e) {
    return {};
  }
}

function saveBinder(cards, id = currentBinderId(), { dirty = true } = {}) {
  if (!id) return false;
  if (!storageSet(CARDS_KEY_PREFIX + id, JSON.stringify(cards))) return false;
  if (dirty) storageSet(DIRTY_KEY_PREFIX + id, String(Date.now()));
  return true;
}

function binderDirtyStamp(id) {
  return storageGet(DIRTY_KEY_PREFIX + id);
}

function markBinderSaved(id, stamp) {
  if (binderDirtyStamp(id) === stamp) storageRemove(DIRTY_KEY_PREFIX + id);
}

function loadBinderList() {
  try { return JSON.parse(storageGet(BINDER_LIST_KEY)) || []; } catch (e) { return []; }
}
function saveBinderList(list) {
  storageSet(BINDER_LIST_KEY, JSON.stringify(list));
}

function binderName(id) {
  const found = loadBinderList().find((b) => b.id === id);
  return found ? found.name : 'Binder';
}

function binderColor(id) {
  const found = loadBinderList().find((b) => b.id === id);
  return found && manaColor(found.color) ? found.color : null;
}

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

function forgetBinder(id) {
  storageRemove(CARDS_KEY_PREFIX + id);
  storageRemove(DIRTY_KEY_PREFIX + id);
  saveBinderList(loadBinderList().filter((b) => b.id !== id));
  if (storageGet(LAST_BINDER_KEY) === id) storageRemove(LAST_BINDER_KEY);
}

function clearAllBinders() {
  for (const binder of loadBinderList()) {
    storageRemove(CARDS_KEY_PREFIX + binder.id);
    storageRemove(DIRTY_KEY_PREFIX + binder.id);
  }
  storageRemove(BINDER_LIST_KEY);
  storageRemove(LAST_BINDER_KEY);
}

function firstEmptyPocket(cards) {
  for (let page = 1; page <= TOTAL_PAGES; page++) {
    for (let slot = 1; slot <= POCKETS_PER_PAGE; slot++) {
      if (!cards[pocketKey(page, slot)]) return { page, slot };
    }
  }
  return null;
}

function isValidCard(card) {
  return card !== null && typeof card === 'object' &&
    typeof card.name === 'string' &&
    typeof card.set === 'string' &&
    typeof card.number === 'string' &&
    typeof card.image === 'string' && card.image.startsWith('https://') &&
    (card.face === 0 || card.face === 1) &&
    (card.lang === undefined || typeof card.lang === 'string');
}

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
