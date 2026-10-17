const POCKETS_PER_PAGE = 16;

const DEFAULT_PAGES = 10;
const MAX_PAGES = 150;

const CARDS_KEY_PREFIX = 'binderCards:';
const DIRTY_KEY_PREFIX = 'binderDirty:';
const BINDER_LIST_KEY = 'binderList';
const LAST_BINDER_KEY = 'lastBinderId';
const LOCAL_MODE_KEY = 'localOnly';

const OLD_SINGLE_BINDER_KEY = 'binderCards';

const FILE_APP_NAME = 'mtg-card-binder';

const SYMBOL_URL = 'https://svgs.scryfall.io/card-symbols/';
const MANA_COLORS = [
  { code: 'W',  name: 'White',     short: 'White',     group: 'single' },
  { code: 'U',  name: 'Blue',      short: 'Blue',      group: 'single' },
  { code: 'B',  name: 'Black',     short: 'Black',     group: 'single' },
  { code: 'R',  name: 'Red',       short: 'Red',       group: 'single' },
  { code: 'G',  name: 'Green',     short: 'Green',     group: 'single' },
  { code: 'C',  name: 'Colorless', short: 'Colorless', group: 'single' },
  { code: 'PW', name: 'Planeswalker', short: 'Planeswalker', group: 'single',
    symbol: 'icons/planeswalker.svg' },
  { code: 'WU', name: 'White and Blue',  short: 'Azorius',  group: 'two' },
  { code: 'UB', name: 'Blue and Black',  short: 'Dimir',    group: 'two' },
  { code: 'BR', name: 'Black and Red',   short: 'Rakdos',   group: 'two' },
  { code: 'RG', name: 'Red and Green',   short: 'Gruul',    group: 'two' },
  { code: 'GW', name: 'Green and White', short: 'Selesnya', group: 'two' },
  { code: 'WB', name: 'White and Black', short: 'Orzhov',   group: 'two' },
  { code: 'UR', name: 'Blue and Red',    short: 'Izzet',    group: 'two' },
  { code: 'BG', name: 'Black and Green', short: 'Golgari',  group: 'two' },
  { code: 'RW', name: 'Red and White',   short: 'Boros',    group: 'two' },
  { code: 'GU', name: 'Green and Blue',  short: 'Simic',    group: 'two' }
].map((color) => ({ ...color, symbol: color.symbol || `${SYMBOL_URL}${color.code}.svg` }));

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

function isCustomCover(code) {
  return typeof code === 'string' && /^#[0-9a-f]{6}$/i.test(code);
}

function cleanCover(code) {
  if (isCustomCover(code)) return code.toLowerCase();
  return COVER_COLORS.some((c) => c.code === code) ? code : DEFAULT_COVER;
}

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

function nextBinderName() {
  const used = new Set(loadBinderList().map((b) => b.name));
  let number = 1;
  while (used.has(`Binder ${number}`)) number++;
  return `Binder ${number}`;
}

function binderPages(id) {
  const found = loadBinderList().find((b) => b.id === id);
  return found ? cleanPageCount(found.pages) : DEFAULT_PAGES;
}

function cleanPageCount(pages) {
  const number = Math.round(Number(pages));
  if (!Number.isFinite(number) || number < 1) return DEFAULT_PAGES;
  return Math.min(number, MAX_PAGES);
}

function minPagesFor(cardCount) {
  return Math.max(1, Math.ceil(cardCount / POCKETS_PER_PAGE));
}

function fitCardsIntoPages(cards, pages) {
  const kept = {};
  const homeless = [];
  for (const [key, card] of Object.entries(cards)) {
    const page = Number(key.split('-')[0]);
    if (page <= pages) kept[key] = card;
    else homeless.push([key, card]);
  }
  homeless.sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));
  for (const [, card] of homeless) {
    const spot = firstEmptyPocket(kept, pages);
    if (spot) kept[pocketKey(spot.page, spot.slot)] = card;
  }
  return kept;
}

function binderCover(id) {
  const found = loadBinderList().find((b) => b.id === id);
  return cleanCover(found && found.cover);
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
    cover: binderCover(id),
    pages: binderPages(id),
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

function isLocalMode() {
  return storageGet(LOCAL_MODE_KEY) === 'yes';
}

function setLocalMode(on) {
  if (on) storageSet(LOCAL_MODE_KEY, 'yes');
  else storageRemove(LOCAL_MODE_KEY);
}

function newLocalBinderId() {
  return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function firstEmptyPocket(cards, pages) {
  for (let page = 1; page <= pages; page++) {
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
    (card.lang === undefined || typeof card.lang === 'string') &&
    (card.count === undefined || (Number.isInteger(card.count) && card.count >= 1)) &&
    (card.foil === undefined || typeof card.foil === 'boolean');
}

const MAX_COPIES = 99;

function cardCount(card) {
  return card && Number.isInteger(card.count) && card.count >= 1
    ? Math.min(card.count, MAX_COPIES)
    : 1;
}

function withCount(card, count) {
  const copy = { ...card };
  if (count > 1) copy.count = Math.min(count, MAX_COPIES);
  else delete copy.count;
  return copy;
}

function samePrinting(a, b) {
  return a.set === b.set && a.number === b.number && a.face === b.face &&
    (a.lang || 'en') === (b.lang || 'en') && Boolean(a.foil) === Boolean(b.foil);
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
    const pocketExists = page >= 1 && page <= MAX_PAGES && slot >= 1 && slot <= POCKETS_PER_PAGE;
    if (pocketExists && isValidCard(card)) cards[pocketKey(page, slot)] = card;
    else skipped++;
  }
  return { cards, skipped };
}
