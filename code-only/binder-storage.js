const TOTAL_PAGES = 10;
const POCKETS_PER_PAGE = 16;

const BINDER_STORAGE_KEY = 'binderCards';

function pocketKey(page, slot) {
  return `${page}-${slot}`;
}

function loadBinder() {
  try {
    return JSON.parse(localStorage.getItem(BINDER_STORAGE_KEY)) || {};
  } catch (e) {
    return {};
  }
}

function saveBinder(cards) {
  try {
    localStorage.setItem(BINDER_STORAGE_KEY, JSON.stringify(cards));
    return true;
  } catch (e) {
    return false;
  }
}

function firstEmptyPocket(cards) {
  for (let page = 1; page <= TOTAL_PAGES; page++) {
    for (let slot = 1; slot <= POCKETS_PER_PAGE; slot++) {
      if (!cards[pocketKey(page, slot)]) return { page, slot };
    }
  }
  return null;
}
