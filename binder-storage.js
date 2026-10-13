/* =========================================================================
   BINDER STORAGE
   Shared by index.html (the binder) and cardsearch.html (the card search),
   so both pages agree on how many pockets there are and where cards are saved.

   The cards are saved in this browser's "localStorage": a small storage
   area each website gets on your computer. It survives closing the browser,
   but it's only on this computer and this browser.
   ========================================================================= */

// How many pages the binder has, and how many pockets on each page (4 x 4).
// Change these numbers here to resize the binder; both pages use them.
const TOTAL_PAGES = 10;
const POCKETS_PER_PAGE = 16;

// The name the binder's cards are saved under in localStorage.
const BINDER_STORAGE_KEY = 'binderCards';

// Each pocket has a short name like "3-5" (page 3, pocket 5),
// used to look up which card is in it.
function pocketKey(page, slot) {
  return `${page}-${slot}`;
}

// Read every saved card. Returns an object like:
//   { "3-5": { name, set, number, face, image }, ... }
// If nothing is saved yet (or the browser blocks storage), it's empty.
function loadBinder() {
  try {
    return JSON.parse(localStorage.getItem(BINDER_STORAGE_KEY)) || {};
  } catch (e) {
    return {};
  }
}

// Save every card back to localStorage. Returns false if storage is blocked
// (for example in some private-browsing windows), so the page can say so.
function saveBinder(cards) {
  try {
    localStorage.setItem(BINDER_STORAGE_KEY, JSON.stringify(cards));
    return true;
  } catch (e) {
    return false;
  }
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
