/* =========================================================================
   cardsearch.js — all the code that makes cardsearch.html work: the
   search box, the Set, Version and Language pickers, the card picture and
   Flip button, sharing, Notes and Rules, Format Legality, and Add to binder.
   It's loaded at the bottom of cardsearch.html, after the page's HTML
   exists, and after binder-storage.js (saving cards into binders) and
   google-drive.js (who's logged in, and Sign out).
   ========================================================================= */

/* =====================================================================
   SETTINGS
   ===================================================================== */

// The address of the Scryfall API (the only data source this app uses).
const API = 'https://api.scryfall.com';

// Picture of the back of a Magic card, hosted by Scryfall.
// Shown before a search, and whenever a card has no picture.
const CARD_BACK = 'https://backs.scryfall.io/large/0/a/0aeebaf5-8c7d-4636-9e82-8c27447861f7.jpg';
const CARD_BACK_ALT = 'Back of a Magic: The Gathering card';

// Search rule: start suggesting once 3 letters are typed. There's no cap
// on how many suggestions appear; the list scrolls when it's long.
const MIN_CHARS = 3;

// Timing, in milliseconds (1000 ms = 1 second).
const TYPING_PAUSE_MS = 120;   // wait this long after a keystroke before searching
const REQUEST_GAP_MS = 100;    // Scryfall asks for this much space between requests
const TOAST_MS = 2000;         // how long "Link copied!" stays visible

// Placeholder text for the pickers before any card is shown.
const EMPTY_PICKER_TEXT = 'Search for a card first';

/* =====================================================================
   PAGE ELEMENTS
   ===================================================================== */

// Grab the page elements we will work with, so we don't look them up repeatedly.
const root          = document.documentElement;   // the <html> tag
const themeSwitch   = document.getElementById('themeSwitch');
const searchInput   = document.getElementById('searchInput');
const suggestionsEl = document.getElementById('suggestions');
const hint          = document.getElementById('hint');
const cardFrame     = document.getElementById('cardFrame');
const cardImage     = document.getElementById('cardImage');
const shareButton   = document.getElementById('shareButton');
const shareToast    = document.getElementById('shareToast');
const binderButton  = document.getElementById('binderButton');
const binderMenu    = document.getElementById('binderMenu');       // "Add to which binder?" list
const binderMenuList = document.getElementById('binderMenuList');  // ...and the binders inside it
const flipButton    = document.getElementById('flipButton');
const cardInfo      = document.getElementById('cardInfo');
const setButton     = document.getElementById('setButton');
const setList       = document.getElementById('setList');
const versionSelect = document.getElementById('versionSelect');
const languageSelect = document.getElementById('languageSelect');
const rulingsBox    = document.getElementById('rulings');
const rulingsBody   = document.getElementById('rulingsBody');
const legalityBox   = document.getElementById('legality');
const legalityList  = document.getElementById('legalityList');

/* =====================================================================
   APP STATE
   ===================================================================== */

// Is someone logged in? (isLoggedIn is in google-drive.js: signed in to
// Google, or their binders are still in this browser.) If not, this page is
// just a card search: no links to binders, and no "Add to binder" button.
const LOGGED_IN = isLoggedIn();

// The app's "memory" of what is currently happening.
const state = {
  allNames: [],          // every card name, prepared for fast matching
  suggestions: [],       // the names currently shown in the suggestion list
  activeSuggestion: -1,  // which suggestion the arrow keys highlight (-1 = none)
  setIcons: new Map(),   // set code -> set symbol picture address
  printsBySet: [],       // the shown card's printings, grouped by set
  currentSet: null,      // the set group being shown
  currentPrint: null,    // the exact printing being shown
  currentFace: 0,        // 0 = front, 1 = back (for double-sided cards)
  languages: [],         // the current printing in every language it was made in
  shownCard: null,       // the language version being shown (English is currentPrint itself)
  languageToken: 0,      // goes up with every printing change; used to ignore stale language lists
  wantedLanguage: null,  // a language asked for by a shared or binder link, e.g. "ja"
  activeSetIndex: -1,    // which row of the set list the arrow keys highlight
  loadToken: 0           // goes up with every card lookup; used to ignore stale answers
};

/* =====================================================================
   SMALL HELPERS
   ===================================================================== */

// Safely turn text into HTML, so a card name (or any outside text) can
// never sneak code into the page. Use this for anything put in innerHTML.
function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// "1 set", "2 sets": add an "s" unless the count is exactly 1.
function plural(count, word) {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

// Show a message under the search box (red if it's an error).
function setHint(message, isError = false) {
  hint.textContent = message;
  hint.classList.toggle('error', isError);
}

// A promise-based pause: "await sleep(100)" waits 100 milliseconds.
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

/* =====================================================================
   TALKING TO SCRYFALL
   ===================================================================== */

// Time the most recent request was (or will be) sent.
let lastRequestTime = 0;

// Fetch JSON from Scryfall. To be polite, wait if the previous request
// was sent less than REQUEST_GAP_MS ago. Throws an Error on failure.
async function scryfall(pathOrUrl) {
  const wait = Math.max(0, lastRequestTime + REQUEST_GAP_MS - Date.now());
  lastRequestTime = Date.now() + wait;
  if (wait) await sleep(wait);

  const url = pathOrUrl.startsWith('http') ? pathOrUrl : API + pathOrUrl;
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  const data = await response.json();
  // Scryfall sends a "details" message when something goes wrong.
  if (!response.ok) throw new Error(data.details || 'Scryfall request failed');
  return data;
}

// Some Scryfall lists come in pages. Keep asking for the next page
// until we have everything, then return one combined list.
async function fetchAllPages(url) {
  const results = [];
  let next = url;
  while (next) {
    const page = await scryfall(next);
    results.push(...page.data);
    next = page.has_more ? page.next_page : null;
  }
  return results;
}

// Download the full list of card names once (about 35,000 names), so the
// search can run instantly in the browser as you type.
async function loadCardNames() {
  try {
    const catalog = await scryfall('/catalog/card-names');
    // Keep each name in a few forms: as shown, simplified, and a list of
    // "word tails" — the compact name starting from each word. For
    // "Krang, Utrom Warlord" the tails are:
    //   "krangutromwarlord", "utromwarlord", "warlord"
    // This lets the search match the start of ANY word quickly.
    state.allNames = catalog.data.map((name) => {
      const words = simplify(name).split(' ');
      return {
        name,
        simple: words.join(' '),
        wordTails: words.map((_, i) => words.slice(i).join(''))
      };
    });
  } catch (err) {
    // Not fatal: the search falls back to Scryfall's own autocomplete.
  }
  // Only show the typing tip if no card lookup has started yet, so we
  // don't overwrite a message like "8 printings across 6 sets".
  if (state.loadToken === 0) setHint(`Type at least ${MIN_CHARS} letters to see suggestions.`);
}

// Download the list of all sets once, to get each set's symbol picture.
async function loadSetIcons() {
  try {
    const sets = await scryfall('/sets');
    for (const set of sets.data) state.setIcons.set(set.code, set.icon_svg_uri);
  } catch (err) {
    // Not fatal: the Set picker just shows no symbols.
  }
}

/* =====================================================================
   TEXT MATCHING (the fuzzy search)
   ===================================================================== */

// Make text easier to compare:
//   - lowercase, and remove accents ("Séance" -> "seance"). NFD splits an
//     accented letter into letter + accent mark; \p{M} then removes the marks.
//   - turn dashes and slashes into spaces ("Ur-Dragon" -> "ur dragon").
//     \p{Pd} means "any kind of dash".
//   - drop all other punctuation (commas, apostrophes, etc.)
//   - squash repeated spaces into one
function simplify(text) {
  return text
    .normalize('NFD').replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[\p{Pd}\/_]/gu, ' ')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// An even simpler version with NO spaces at all, so spacing and
// punctuation never matter: "ur dragon", "ur-dragon" and "urdragon"
// all become "urdragon".
function compact(text) {
  return simplify(text).replace(/ /g, '');
}

// Count how many single-letter edits (add, remove, or change a letter)
// turn one word into another. This is the "Levenshtein distance" and
// lets the search forgive typos like "lightnig" for "lightning".
function editDistance(a, b) {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
    }
    previous = current;
  }
  return previous[b.length];
}

// Score how well a card name matches what was typed, for when NO word
// in any name starts with the typed text. Higher = better; 0 = no match.
// Checks, best first:
//   1. the text appears inside a word ("ightning" -> "Lightning Bolt")
//   2. the letters appear in order with small gaps ("lgtbolt" -> "Lightning Bolt")
//   3. close enough with a typo or two ("lightnig" -> "Lightning Bolt")
function fuzzyScore(query, target) {
  const index = target.indexOf(query);
  if (index !== -1) return 700 - index - (target.length - query.length) * 0.1;

  // Letters in order: walk through the name looking for each typed letter.
  // Matches that begin at the start of a word get a bonus, and matches
  // that begin further into the name get a small penalty.
  let position = 0;
  let gaps = 0;
  let firstFound = -1;
  let lastFound = -1;
  let inOrder = true;
  for (const letter of query) {
    const found = target.indexOf(letter, position);
    if (found === -1) { inOrder = false; break; }
    if (firstFound === -1) firstFound = found;
    if (lastFound !== -1) gaps += found - lastFound - 1;
    lastFound = found;
    position = found + 1;
  }
  if (inOrder && gaps <= query.length * 2) {
    const wordStartBonus = (firstFound === 0 || target[firstFound - 1] === ' ') ? 40 : 0;
    return 500 + wordStartBonus - gaps * 5 - firstFound * 2 - target.length * 0.1;
  }

  // Typo check: compare the typed text with same-length chunks of the
  // name that begin at the start of each word. Longer text may have more typos.
  if (query.length >= 4) {
    const allowedTypos = query.length >= 8 ? 2 : 1;
    let best = Infinity;
    for (let start = 0; start < target.length && best > 0; start++) {
      if (start > 0 && target[start - 1] !== ' ') continue;
      best = Math.min(best, editDistance(query, target.slice(start, start + query.length)));
    }
    if (best <= allowedTypos) return 300 - best * 50 - target.length * 0.1;
  }
  return 0;
}

// Find every card name that matches the typed text, best matches first.
function fuzzySearch(text) {
  const query = simplify(text);
  if (!query) return [];

  // Step 1: if the typed text matches the start of the name, or the start
  // of any later word, show ONLY those cards. We compare compact forms, so
  // "krang utrom" and "utrom" both match "Krang, Utrom Warlord".
  const typedCompact = compact(text);
  const wordMatches = [];
  for (const entry of state.allNames) {
    const wordIndex = entry.wordTails.findIndex((tail) => tail.startsWith(typedCompact));
    if (wordIndex !== -1) wordMatches.push({ entry, wordIndex });
  }
  if (wordMatches.length) {
    // Names that START with it come first, then matches on the 2nd word,
    // then the 3rd, and so on. Ties: shorter names first, then A to Z.
    wordMatches.sort((a, b) =>
      a.wordIndex - b.wordIndex ||
      a.entry.simple.length - b.entry.simple.length ||
      a.entry.name.localeCompare(b.entry.name));
    return wordMatches.map((m) => m.entry.name);
  }

  // Step 2: nothing starts with it, so score every name with fuzzyScore.
  const scored = [];
  for (const entry of state.allNames) {
    const score = fuzzyScore(query, entry.simple);
    if (score > 0) scored.push({ name: entry.name, score });
  }
  // Best score first; if tied, shorter names first.
  scored.sort((a, b) => b.score - a.score || a.name.length - b.name.length);
  return scored.map((m) => m.name);
}

// Get suggestions for the typed text: our own fuzzy search once the name
// list has downloaded, or Scryfall's autocomplete until then.
async function findSuggestions(text) {
  if (state.allNames.length) return fuzzySearch(text);
  try {
    const result = await scryfall('/cards/autocomplete?q=' + encodeURIComponent(text));
    return result.data;   // Scryfall sends at most 20 names here
  } catch (err) {
    return [];
  }
}

/* =====================================================================
   SUGGESTION LIST (live as you type)
   ===================================================================== */

// Wrap the part of the name that matches the typed text in <mark> so it
// shows up highlighted. Spaces and punctuation are ignored, so typing
// "ur dragon" still highlights "Ur-Dragon" in the name.
function highlight(name, typed) {
  const typedCompact = compact(typed);
  if (!typedCompact) return escapeHtml(name);

  // Build a compact copy of the name, remembering where each of its
  // letters came from in the original name.
  let nameCompact = '';
  const origin = [];
  for (let i = 0; i < name.length; i++) {
    const letter = compact(name[i]);
    if (letter) { nameCompact += letter; origin.push(i); }
  }

  // Does the compact letter at "pos" begin a word in the real name?
  // (True at the very start, or right after a space/dash/comma — but not
  // after an apostrophe, so the "s" in "Karn's" doesn't count.)
  const startsWord = (pos) => {
    const before = name[origin[pos] - 1];
    return origin[pos] === 0 || (before !== "'" && compact(before) === '');
  };

  // Find the typed text in the compact name, preferring a spot at the
  // start of a word (so "utrom" highlights "Utrom", not the middle of
  // some other word). If there's no match at all, highlight nothing.
  let at = nameCompact.indexOf(typedCompact);
  for (let pos = at; pos !== -1; pos = nameCompact.indexOf(typedCompact, pos + 1)) {
    if (startsWord(pos)) { at = pos; break; }
  }
  if (at === -1) return escapeHtml(name);

  // Turn the compact positions back into positions in the real name.
  const start = origin[at];
  const end = origin[at + typedCompact.length - 1] + 1;
  return escapeHtml(name.slice(0, start)) +
         '<mark>' + escapeHtml(name.slice(start, end)) + '</mark>' +
         escapeHtml(name.slice(end));
}

// Draw the suggestion list under the search box. Each row stores its
// position in a data-index attribute so clicks know which name was picked.
function renderSuggestions(names) {
  if (!names.length) { hideSuggestions(); return; }
  state.suggestions = names;
  state.activeSuggestion = -1;
  searchInput.removeAttribute('aria-activedescendant');
  suggestionsEl.innerHTML = names.map((name, i) =>
    `<li id="suggestion-${i}" role="option" data-index="${i}">${highlight(name, searchInput.value)}</li>`
  ).join('');
  suggestionsEl.hidden = false;
  searchInput.setAttribute('aria-expanded', 'true');
}

// Close the suggestion list.
function hideSuggestions() {
  suggestionsEl.hidden = true;
  suggestionsEl.innerHTML = '';
  state.suggestions = [];
  state.activeSuggestion = -1;
  searchInput.setAttribute('aria-expanded', 'false');
  searchInput.removeAttribute('aria-activedescendant');
}

// Highlight one suggestion (used by the up/down arrow keys).
function setActiveSuggestion(index) {
  const items = suggestionsEl.querySelectorAll('li');
  items.forEach((li) => li.classList.remove('active'));
  state.activeSuggestion = index;
  const item = items[index];
  if (item) {
    item.classList.add('active');
    item.scrollIntoView({ block: 'nearest' });
    searchInput.setAttribute('aria-activedescendant', item.id);
  }
}

// Put the chosen name in the box and load that card.
function chooseSuggestion(name) {
  cancelPendingSearch();
  searchInput.value = name;
  hideSuggestions();
  loadCardByName(name, true);
}

// The timer for the search that runs after a short pause in typing.
let typingTimer = null;

// Cancel any search still waiting to run (or still waiting on Scryfall),
// so its results don't pop up after a card was already chosen.
function cancelPendingSearch() {
  clearTimeout(typingTimer);
  typingTimer = null;
}

// Every time the text changes: wait for a short pause in typing, then look
// up suggestions. Waiting means we don't search on every single keystroke.
searchInput.addEventListener('input', () => {
  cancelPendingSearch();
  const text = searchInput.value;
  if (text.trim().length < MIN_CHARS) { hideSuggestions(); return; }

  const timer = setTimeout(async () => {
    const names = await findSuggestions(text);
    // Only show them if this is still the latest search (nobody kept
    // typing, picked a card, or pressed Enter in the meantime).
    if (typingTimer === timer) renderSuggestions(names);
  }, TYPING_PAUSE_MS);
  typingTimer = timer;
});

// Keyboard controls for the search box: arrows move, Enter picks, Esc closes.
searchInput.addEventListener('keydown', (event) => {
  const count = state.suggestions.length;

  if (event.key === 'ArrowDown' && count) {
    event.preventDefault();
    setActiveSuggestion((state.activeSuggestion + 1) % count);
  } else if (event.key === 'ArrowUp' && count) {
    event.preventDefault();
    setActiveSuggestion((state.activeSuggestion - 1 + count) % count);
  } else if (event.key === 'Enter') {
    event.preventDefault();
    if (state.activeSuggestion !== -1) {
      chooseSuggestion(state.suggestions[state.activeSuggestion]);
    } else if (searchInput.value.trim()) {
      // No suggestion picked: let Scryfall's own fuzzy lookup find the closest card.
      cancelPendingSearch();
      hideSuggestions();
      loadCardByName(searchInput.value.trim(), false);
    }
  } else if (event.key === 'Escape') {
    cancelPendingSearch();
    hideSuggestions();
  }
});

// Pressing the mouse anywhere on the list (a row OR its scrollbar) would
// normally take focus away from the search box and close the list.
// preventDefault() stops that. If the press was on a row, pick it.
suggestionsEl.addEventListener('mousedown', (event) => {
  event.preventDefault();
  const li = event.target.closest('li');
  if (li) chooseSuggestion(state.suggestions[Number(li.dataset.index)]);
});

// When the search box loses focus (e.g., clicking elsewhere), close the list.
searchInput.addEventListener('blur', () => {
  cancelPendingSearch();
  hideSuggestions();
});

/* =====================================================================
   LOADING A CARD AND ALL ITS PRINTINGS
   ===================================================================== */

// Look up a card by name. "exact" is true when the name came from the
// suggestion list; otherwise Scryfall guesses the closest match.
function loadCardByName(name, exact) {
  const mode = exact ? 'exact' : 'fuzzy';
  return openCard(`/cards/named?${mode}=${encodeURIComponent(name)}`, 0);
}

// Look up one exact printing by its set code and collector number
// (used when someone opens a shared link). "face" is 1 for the back side.
function loadCardBySetAndNumber(setCode, number, face) {
  return openCard(`/cards/${encodeURIComponent(setCode)}/${encodeURIComponent(number)}`, face);
}

// Fetch a card from Scryfall, then fetch every printing of it and fill
// in the Set and Version pickers, starting on the printing we asked for.
async function openCard(lookupPath, face) {
  const myToken = ++state.loadToken;   // remember which lookup this is
  setHint('Loading…');
  cardFrame.classList.add('loading');

  try {
    const card = await scryfall(lookupPath);
    const prints = await fetchAllPages(card.prints_search_uri);
    await setIconsReady;               // make sure set symbols are available

    // A newer lookup started while we were waiting? Then drop this one.
    if (myToken !== state.loadToken) return;

    searchInput.value = card.name;
    state.printsBySet = groupBySet(prints);

    // Start on the printing Scryfall returned (for a name search that's
    // usually the newest one; for a shared link it's the exact one).
    const startSet = state.printsBySet.find((s) => s.code === card.set) || state.printsBySet[0];
    const startPrint = startSet.prints.find((p) => p.id === card.id) || startSet.prints[0];

    setHint(`${plural(prints.length, 'printing')} across ${plural(state.printsBySet.length, 'set')}.`);
    selectSet(startSet, startPrint);
    if (face === 1) showFace(1);       // a shared link may ask for the back side

    // Rulings are the same for every printing, so fetch them once per
    // card. No "await": the card shows right away while rulings load.
    loadRulings(card.rulings_uri, myToken);
  } catch (err) {
    if (myToken !== state.loadToken) return;
    setHint(err.message || 'Something went wrong.', true);
    resetCardDetails();
    showCardBack();
  }
}

// Sort printings into groups, one group per set, newest set first.
// Inside each set, sort by collector number (1, 2, 10 — not 1, 10, 2).
function groupBySet(prints) {
  const groups = new Map();
  for (const print of prints) {
    if (!groups.has(print.set)) {
      groups.set(print.set, {
        code: print.set,
        name: print.set_name,
        released: print.released_at,
        icon: state.setIcons.get(print.set) || null,
        prints: []
      });
    }
    groups.get(print.set).prints.push(print);
  }
  const list = [...groups.values()];
  list.sort((a, b) => b.released.localeCompare(a.released));
  for (const group of list) {
    group.prints.sort((a, b) =>
      a.collector_number.localeCompare(b.collector_number, undefined, { numeric: true }));
  }
  return list;
}

// Put the pickers, buttons and info text back to their empty
// "search first" state.
function resetCardDetails() {
  state.printsBySet = [];
  state.currentSet = null;
  state.currentPrint = null;
  state.currentFace = 0;
  setButton.disabled = true;
  setButton.innerHTML = `<span class="set-name">${EMPTY_PICKER_TEXT}</span>`;
  setList.innerHTML = '';
  closeSetList(false);
  versionSelect.disabled = true;
  versionSelect.innerHTML = `<option>${EMPTY_PICKER_TEXT}</option>`;
  state.languages = [];
  state.shownCard = null;
  state.languageToken++;               // ignore any language list still loading
  state.wantedLanguage = null;         // forget a language a failed link asked for
  languageSelect.disabled = true;
  languageSelect.innerHTML = `<option>${EMPTY_PICKER_TEXT}</option>`;
  flipButton.hidden = true;
  shareButton.hidden = true;
  binderButton.hidden = true;
  closeBinderMenu(false);
  cardInfo.innerHTML = '';
  rulingsBox.hidden = true;
  rulingsBody.innerHTML = '';
  legalityBox.hidden = true;
  legalityList.replaceChildren();
}

/* =====================================================================
   NOTES AND RULES
   ===================================================================== */

// Who published a ruling: Scryfall marks official ones as "wotc".
const RULING_SOURCES = { wotc: 'Wizards of the Coast', scryfall: 'Scryfall' };

// Turn "2011-09-22" into a friendly date like "Sep 22, 2011".
// (timeZone UTC stops the date shifting a day in some time zones.)
function formatDate(isoDate) {
  return new Date(isoDate).toLocaleDateString(undefined,
    { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

// Show a single line of text in the box (loading, empty, or error).
function showRulingsMessage(message) {
  rulingsBody.innerHTML = `<p class="rulings-message">${escapeHtml(message)}</p>`;
}

// Download the official rulings for a card and list them, oldest first
// (the order Scryfall sends them). "token" is the card lookup they belong
// to; if a newer card was opened meanwhile, the results are thrown away.
async function loadRulings(rulingsUrl, token) {
  rulingsBox.hidden = false;
  showRulingsMessage('Loading rulings…');
  try {
    const rulings = await fetchAllPages(rulingsUrl);
    if (token !== state.loadToken) return;
    if (!rulings.length) {
      showRulingsMessage('There are no rulings for this card.');
      return;
    }
    rulingsBody.innerHTML = '<ul class="rulings-list">' + rulings.map((r) =>
      '<li>' +
        `<span class="ruling-date">${escapeHtml(formatDate(r.published_at))}` +
        ` · ${escapeHtml(RULING_SOURCES[r.source] || r.source)}</span>` +
        escapeHtml(r.comment) +
      '</li>'
    ).join('') + '</ul>';
  } catch (err) {
    if (token !== state.loadToken) return;
    showRulingsMessage('Rulings could not be loaded right now.');
  }
}

/* =====================================================================
   SET PICKER (custom drop-down with set symbols)
   ===================================================================== */

// Build the HTML for one set row: symbol | CODE | Set Name
function setRowHtml(set) {
  const icon = set.icon
    ? `<img class="set-icon" src="${escapeHtml(set.icon)}" alt="">`
    : '<span class="set-icon"></span>';
  return `${icon}<span class="sep">|</span>` +
         `<span class="set-code">${escapeHtml(set.code.toUpperCase())}</span>` +
         '<span class="sep">|</span>' +
         `<span class="set-name">${escapeHtml(set.name)}</span>`;
}

// Switch to a set: update the Set button and list, rebuild the Version
// list, and show a printing from that set (the first one if none given).
function selectSet(set, print = set.prints[0]) {
  state.currentSet = set;
  setButton.disabled = false;
  setButton.innerHTML = setRowHtml(set);

  // Fill the set pop-up list, marking the chosen set as selected.
  setList.innerHTML = state.printsBySet.map((s, i) =>
    `<li id="set-option-${i}" role="option" data-index="${i}" aria-selected="${s === set}">` +
    `${setRowHtml(s)}</li>`
  ).join('');

  // Fill the Version drop-down with each printing in this set.
  versionSelect.disabled = false;
  versionSelect.innerHTML = set.prints.map((p) =>
    `<option value="${escapeHtml(p.id)}">${escapeHtml(versionLabel(p))}</option>`
  ).join('');

  selectPrint(print);
}

// Open the set pop-up list and highlight the current set.
function openSetList() {
  setList.hidden = false;
  setButton.setAttribute('aria-expanded', 'true');
  setActiveSet(state.printsBySet.indexOf(state.currentSet));
  setList.focus();
}

// Close the set pop-up list (optionally putting focus back on the button).
function closeSetList(returnFocus) {
  setList.hidden = true;
  setButton.setAttribute('aria-expanded', 'false');
  if (returnFocus) setButton.focus();
}

// Highlight one row of the set list (for keyboard use).
function setActiveSet(index) {
  const items = setList.querySelectorAll('li');
  items.forEach((li) => li.classList.remove('active'));
  state.activeSetIndex = index;
  const item = items[index];
  if (item) {
    item.classList.add('active');
    item.scrollIntoView({ block: 'nearest' });
    setList.setAttribute('aria-activedescendant', item.id);
  }
}

// Pick the set at a row number in the list, then close the list.
function chooseSet(index) {
  const set = state.printsBySet[index];
  if (set) selectSet(set);
  closeSetList(true);
}

// Clicking the Set button opens or closes the list.
setButton.addEventListener('click', () => {
  if (setList.hidden) openSetList();
  else closeSetList(true);
});

// Pressing the down/up arrow on the Set button also opens the list.
setButton.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    openSetList();
  }
});

// Keyboard controls inside the set list.
setList.addEventListener('keydown', (event) => {
  const last = state.printsBySet.length - 1;
  const index = state.activeSetIndex;
  switch (event.key) {
    case 'ArrowDown': event.preventDefault(); setActiveSet(Math.min(last, index + 1)); break;
    case 'ArrowUp':   event.preventDefault(); setActiveSet(Math.max(0, index - 1)); break;
    case 'Home':      event.preventDefault(); setActiveSet(0); break;
    case 'End':       event.preventDefault(); setActiveSet(last); break;
    case 'Enter':
    case ' ':         event.preventDefault(); chooseSet(index); break;
    case 'Escape':    closeSetList(true); break;
    case 'Tab':       closeSetList(false); break;
  }
});

// Clicking a set row picks that set.
setList.addEventListener('click', (event) => {
  const li = event.target.closest('li');
  if (li) chooseSet(Number(li.dataset.index));
});

// Clicking anywhere outside the set picker closes its list.
document.addEventListener('click', (event) => {
  if (!setList.hidden && !event.target.closest('.set-picker')) closeSetList(false);
});

/* =====================================================================
   VERSION PICKER
   ===================================================================== */

// Readable names for Scryfall's "frame effect" codes we want to show.
const FRAME_EFFECT_NAMES = {
  showcase: 'Showcase',
  extendedart: 'Extended Art',
  inverted: 'Inverted'
};

// Build a readable label for one printing, e.g.
// "#287 · Borderless, Showcase · Nonfoil / Foil"
function versionLabel(print) {
  // Special looks this printing has.
  const styles = [];
  if (print.border_color === 'borderless') styles.push('Borderless');
  if (print.full_art) styles.push('Full Art');
  if (print.textless) styles.push('Textless');
  // An old-style frame on a card printed after 2003 means a deliberate
  // "retro" reprint (original old cards just have the old frame normally).
  const oldFrame = print.frame === '1993' || print.frame === '1997';
  if (oldFrame && Number(print.released_at.slice(0, 4)) > 2003) styles.push('Retro Frame');
  for (const effect of print.frame_effects || []) {
    if (FRAME_EFFECT_NAMES[effect]) styles.push(FRAME_EFFECT_NAMES[effect]);
  }
  if (print.promo) styles.push('Promo');

  // Finishes it was printed in: "nonfoil" -> "Nonfoil", etc.
  const finishes = (print.finishes || []).map((f) => f[0].toUpperCase() + f.slice(1));

  // Join the pieces with " · ", skipping any that are empty.
  const parts = [`#${print.collector_number}`];
  if (styles.length) parts.push(styles.join(', '));
  if (finishes.length) parts.push(finishes.join(' / '));
  if (print.lang && print.lang !== 'en') parts.push(print.lang.toUpperCase());
  return parts.join(' · ');
}

// Choosing a different version shows that printing.
versionSelect.addEventListener('change', () => {
  const print = state.currentSet.prints.find((p) => p.id === versionSelect.value);
  if (print) selectPrint(print);
});

// Does this printing have a separate picture for its back side?
function isDoubleSided(print) {
  const faces = print.card_faces || [];
  return !print.image_uris && faces.length > 1 && Boolean(faces[1].image_uris);
}

// Show one specific printing: picture (front side), info text, and buttons.
function selectPrint(print) {
  state.currentPrint = print;
  state.shownCard = print;      // start in the printing's own language
  versionSelect.value = print.id;
  loadLanguages(print);         // fill the Language picker (in the background)
  flipButton.hidden = !isDoubleSided(print);
  shareButton.hidden = false;   // a card is showing, so it can be shared...
  binderButton.hidden = !LOGGED_IN;   // ...and added to a binder (only when logged in)
  showFace(0);
  cardInfo.innerHTML =
    `<strong>${escapeHtml(print.name)}</strong><br>` +
    `${escapeHtml(print.set_name)} · #${escapeHtml(print.collector_number)}` +
    (print.artist ? ` · Illustrated by ${escapeHtml(print.artist)}` : '') +
    `<br><a href="${escapeHtml(print.scryfall_uri)}" target="_blank" rel="noopener">View on Scryfall</a>`;
  showLegalities(print);
}

/* =====================================================================
   FORMAT LEGALITY
   Scryfall's card details include "legalities": for each format (way of
   playing), whether the card is "legal", "not_legal", "banned" or
   "restricted" (allowed, but only one copy). It's the same for every
   printing of a card.
   ===================================================================== */

// The formats to show, in this order, with the names people know them by.
// (Scryfall uses short codes like "paupercommander"; the names come from
// Scryfall's search help page.) Any format Scryfall adds later that isn't
// listed here still shows, at the end, under its code.
const FORMAT_NAMES = [
  ['standard', 'Standard'],          ['future', 'Future Standard'],
  ['pioneer', 'Pioneer'],            ['modern', 'Modern'],
  ['legacy', 'Legacy'],              ['vintage', 'Vintage'],
  ['pauper', 'Pauper'],              ['commander', 'Commander'],
  ['oathbreaker', 'Oathbreaker'],    ['paupercommander', 'Pauper Commander'],
  ['duel', 'Duel Commander'],        ['predh', 'PreDH'],
  ['tlr', 'Tiny Leaders: Reborn'],   ['brawl', 'Brawl'],
  ['standardbrawl', 'Standard Brawl'], ['competitivebrawl', 'Competitive Brawl'],
  ['historic', 'Historic'],          ['timeless', 'Timeless'],
  ['alchemy', 'Alchemy'],            ['gladiator', 'Gladiator'],
  ['penny', 'Penny Dreadful'],       ['premodern', 'Premodern'],
  ['oldschool', 'Old School 93/94']
];

// The words shown on each status label.
const LEGALITY_WORDS = {
  legal: 'Legal',
  not_legal: 'Not Legal',
  banned: 'Banned',
  restricted: 'Restricted'
};

// Fill the Format Legality box for a printing: one line per format, with
// the format's name and a colored status label. (Built with
// textContent, never innerHTML, so nothing from outside can sneak in code.)
function showLegalities(print) {
  const legalities = print.legalities || {};
  legalityList.replaceChildren();

  // Our list first, then any formats we don't know the name of yet.
  const known = new Set(FORMAT_NAMES.map(([code]) => code));
  const formats = [
    ...FORMAT_NAMES.filter(([code]) => code in legalities),
    ...Object.keys(legalities).filter((code) => !known.has(code)).map((code) => [code, code])
  ];

  for (const [code, name] of formats) {
    const status = legalities[code];
    const item = document.createElement('li');
    const label = document.createElement('span');
    label.textContent = name;
    const tag = document.createElement('span');
    // The status picks the label's color (see cardsearch.css). Unknown
    // statuses get the grey "not legal" look.
    tag.className = `legality-status ${LEGALITY_WORDS[status] ? status : 'not_legal'}`;
    tag.textContent = LEGALITY_WORDS[status] || String(status);
    item.append(label, tag);
    legalityList.appendChild(item);
  }
  legalityBox.hidden = formats.length === 0;
}

/* =====================================================================
   LANGUAGES
   ===================================================================== */

// Scryfall's language codes and the names we show for them.
// Any code not listed here is just shown in capitals (e.g. "XX").
const LANGUAGE_NAMES = {
  en: 'English', es: 'Spanish', fr: 'French', de: 'German', it: 'Italian',
  pt: 'Portuguese', ja: 'Japanese', ko: 'Korean', ru: 'Russian',
  zhs: 'Chinese (Simplified)', zht: 'Chinese (Traditional)', he: 'Hebrew',
  la: 'Latin', grc: 'Ancient Greek', ar: 'Arabic', sa: 'Sanskrit',
  ph: 'Phyrexian', qya: 'Quenya'
};

// The name to show for a language code.
function languageName(code) {
  return LANGUAGE_NAMES[code] || String(code).toUpperCase();
}

// Fill the Language picker with every language this exact printing was
// made in. Scryfall treats each language as its own card, so we search for
// "this set + this collector number, in any language".
async function loadLanguages(print) {
  const myToken = ++state.languageToken;   // remember which printing this is for

  // While loading: show just the current language, greyed out.
  languageSelect.disabled = true;
  languageSelect.innerHTML =
    `<option value="${escapeHtml(print.lang)}">${escapeHtml(languageName(print.lang))}</option>`;

  let versions;
  try {
    const query = `set:${print.set} cn:"${print.collector_number}" lang:any`;
    versions = await fetchAllPages(
      `/cards/search?unique=prints&q=${encodeURIComponent(query)}`);
  } catch (err) {
    versions = [];   // couldn't load the list: fall back to just this printing
  }

  // The person switched to another printing while we waited? Drop this list.
  if (myToken !== state.languageToken) return;

  // Make sure this printing itself is in the list, then sort:
  // English first, then the rest in A–Z order of their names.
  if (!versions.some((v) => v.lang === print.lang)) versions.push(print);
  versions.sort((a, b) =>
    (b.lang === 'en') - (a.lang === 'en') ||
    languageName(a.lang).localeCompare(languageName(b.lang)));
  state.languages = versions;

  languageSelect.innerHTML = versions.map((v) =>
    `<option value="${escapeHtml(v.lang)}">${escapeHtml(languageName(v.lang))}</option>`
  ).join('');
  languageSelect.value = state.shownCard.lang;
  // Only one language? Then there's nothing to choose, so keep it greyed out.
  languageSelect.disabled = versions.length < 2;

  // A shared or binder link asked for a particular language: switch to it
  // (only once, for the card the link opened).
  if (state.wantedLanguage) {
    const wanted = state.wantedLanguage;
    state.wantedLanguage = null;
    if (wanted !== state.shownCard.lang && versions.some((v) => v.lang === wanted)) {
      languageSelect.value = wanted;
      showLanguage(wanted);
    }
  }
}

// Show the card in another language, keeping the same side facing up.
function showLanguage(code) {
  const version = state.languages.find((v) => v.lang === code);
  if (!version) return;
  state.shownCard = version;
  showFace(state.currentFace);
}

// Choosing a language in the picker shows that language's card.
languageSelect.addEventListener('change', () => showLanguage(languageSelect.value));

/* =====================================================================
   CARD PICTURE
   ===================================================================== */

// Show the front (0) or back (1) of the current printing, in the chosen
// language. Asking for the back of a single-sided card does nothing.
function showFace(face) {
  const print = state.currentPrint;
  if (!print || (face === 1 && !isDoubleSided(print))) return;
  state.currentFace = face;
  showCardImage(state.shownCard, face);
}

// The Flip button switches to the other side.
flipButton.addEventListener('click', () => showFace(state.currentFace === 0 ? 1 : 0));

// Find the picture address for one side of a printing. Returns null when
// Scryfall has no real picture, so we can show the card back instead.
// "sizes" says which picture size to use, in order of preference: the
// card on this page uses "large" (falling back to "normal"); binder pockets
// use "normal" (see binderImageFor).
function imageFor(print, face, sizes = ['large', 'normal']) {
  if (print.image_status === 'missing' || print.image_status === 'placeholder') return null;
  // Single-sided cards keep their picture on the card itself;
  // double-sided cards keep one picture per side in card_faces.
  const uris = print.image_uris || (print.card_faces && print.card_faces[face].image_uris);
  if (!uris) return null;
  const size = sizes.find((s) => uris[s]);
  return size ? uris[size] : null;
}

// Swap in a new picture. The loading spinner shows until it arrives.
// (If it's the same picture already showing, there's nothing to wait for.)
function setPicture(url, alt) {
  cardImage.alt = alt;
  if (cardImage.src === url) {
    cardFrame.classList.remove('loading');
    return;
  }
  cardFrame.classList.add('loading');
  cardImage.src = url;
}

// Show one side of a printing, or the card back if it has no picture.
function showCardImage(print, face) {
  const url = imageFor(print, face);
  if (!url) { showCardBack(); return; }
  // Double-sided cards: describe the side showing. Otherwise: the full name.
  const faceName = isDoubleSided(print) ? print.card_faces[face].name : print.name;
  setPicture(url, `${faceName} — ${print.set_name}`);
}

// Show the back of a Magic card.
function showCardBack() {
  setPicture(CARD_BACK, CARD_BACK_ALT);
}

// When the picture finishes downloading, hide the loading spinner.
cardImage.addEventListener('load', () => cardFrame.classList.remove('loading'));

// If a picture fails to download, show the card back instead.
// (If the card back itself fails, just stop the spinner — no endless loop.)
cardImage.addEventListener('error', () => {
  if (cardImage.src !== CARD_BACK) showCardBack();
  else cardFrame.classList.remove('loading');
});

/* =====================================================================
   SHARING A LINK TO THE CARD
   ===================================================================== */

// Build a link to this app that opens the exact card being shown, e.g.
//   cardsearch.html?set=isd&number=51            (front side)
//   cardsearch.html?set=isd&number=51&face=back  (back side)
//   cardsearch.html?set=isd&number=51&lang=ja    (in Japanese)
// The set code + collector number pin down one specific printing.
function shareLink() {
  const link = new URL(location.href);
  link.search = '';
  link.hash = '';
  link.searchParams.set('set', state.currentPrint.set);
  link.searchParams.set('number', state.currentPrint.collector_number);
  if (state.currentFace === 1) link.searchParams.set('face', 'back');
  const lang = state.shownCard.lang;
  if (lang !== state.currentPrint.lang) link.searchParams.set('lang', lang);
  return link.toString();
}

// Briefly show a message under the Share button, then hide it again.
let toastTimer = null;
function showToast(message) {
  shareToast.textContent = message;
  shareToast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { shareToast.hidden = true; }, TOAST_MS);
}

// Clicking Share: on devices with a built-in share menu (phones, and some
// desktop browsers) open that menu. Otherwise copy the link to the
// clipboard. If even copying is blocked, show the link so it can be
// copied by hand.
shareButton.addEventListener('click', async () => {
  if (!state.currentPrint) return;
  const url = shareLink();
  const title = `${state.currentPrint.name} — ${state.currentPrint.set_name}`;

  if (navigator.share) {
    try {
      await navigator.share({ title, text: title, url });
      return;
    } catch (err) {
      // The person closed the share menu: that's fine, do nothing.
      if (err.name === 'AbortError') return;
      // Any other problem: fall through and copy the link instead.
    }
  }

  try {
    await navigator.clipboard.writeText(url);
    showToast('Link copied!');
  } catch (err) {
    window.prompt('Copy this link to share the card:', url);
  }
});

// If the page was opened from a shared link (?set=...&number=...),
// show that exact card. A "lang=ja" in the link is remembered, and the
// Language picker switches to it once the languages have loaded.
function openSharedLinkIfAny() {
  const params = new URLSearchParams(location.search);
  const setCode = params.get('set');
  const number = params.get('number');
  state.wantedLanguage = params.get('lang');
  if (setCode && number) {
    loadCardBySetAndNumber(setCode, number, params.get('face') === 'back' ? 1 : 0);
  }
}

/* =====================================================================
   ADDING THE CARD TO THE BINDER
   (uses the binder helpers in binder-storage.js, shared with the other
   pages: loadBinder, saveBinder, pocketKey, firstEmptyPocket, binderPages,
   binderName and currentBinderId)
   ===================================================================== */

// Which binder this page came from. The binder page puts it in the address
// ("?binder=1AbC..."), and "+" adds cards to it. If this page was opened
// on its own, it's the binder opened most recently, used only for the
// footer's link back to it ("+" asks which binder instead). (null = no
// binder opened yet in this browser.)
const targetBinderId = currentBinderId() || storageGet(LAST_BINDER_KEY) || null;

// When logged in (LOGGED_IN, near the top of this file), show the
// footer's "My Binders" link.
document.getElementById('myBindersItem').hidden = !LOGGED_IN;

// Show the footer link back to that binder, with its name (logged in only).
if (LOGGED_IN && targetBinderId) {
  const backLink = document.getElementById('backToBinderLink');
  backLink.textContent = binderName(targetBinderId);
  backLink.href = `binder.html?binder=${encodeURIComponent(targetBinderId)}`;
  document.getElementById('backToBinderItem').hidden = false;
}

// Which pocket we're filling. When you click a pocket's "+" (or a card
// already in a pocket), binder.html opens this page with
// "?binderPage=3&binderSlot=5" in the address. If those are missing
// (this page was opened directly), it stays null and the card goes
// into the first empty pocket instead.
const binderTarget = (() => {
  const params = new URLSearchParams(location.search);
  const page = parseInt(params.get('binderPage'), 10);
  const slot = parseInt(params.get('binderSlot'), 10);
  // It must be a real pocket. (The link comes from the binder page, which
  // only links to pockets it shows, so the 150-page limit is enough here.)
  const valid = page >= 1 && page <= MAX_PAGES && slot >= 1 && slot <= POCKETS_PER_PAGE;
  return valid ? { page, slot } : null;
})();

// A smaller picture for the binder pocket (the "normal" size is plenty
// for a pocket and downloads faster). No picture? Use the card back.
function binderImageFor(print, face) {
  return imageFor(print, face, ['normal', 'large']) || CARD_BACK;
}

// Was this page opened from a binder (its pocket's "+", or a card in it)?
// Then the address names the binder ("?binder=1AbC..."), and "+" adds the
// card straight to it. Opened on its own (e.g. from the footer link), "+"
// asks which binder instead (see the binder menu below).
const OPENED_FROM_BINDER = Boolean(currentBinderId());

// When "+" opens the menu, tell screen readers it opens a list (and which
// one), and change its tooltip to say so.
if (!OPENED_FROM_BINDER) {
  binderButton.setAttribute('aria-haspopup', 'true');
  binderButton.setAttribute('aria-controls', 'binderMenu');
  binderButton.setAttribute('aria-expanded', 'false');
  binderButton.title = 'Add to a binder…';
}

// Clicking "Add to binder" ("+"): when opened from a binder, add the card
// to it; otherwise open (or close) the "Add to which binder?" menu.
binderButton.addEventListener('click', () => {
  if (!state.currentPrint || !LOGGED_IN) return;   // (the button is hidden when not logged in anyway)
  if (OPENED_FROM_BINDER) {
    addCardToBinder(targetBinderId, binderTarget);
  } else if (binderMenu.hidden) {
    openBinderMenu();
  } else {
    closeBinderMenu(true);
  }
});

/* ----- The "Add to which binder?" menu ----- */

// Open the menu under the "+" with one row per binder (in shelf order):
// a dot in the binder's cover color, its name, and how many cards it has.
// A full binder is shown but can't be picked. The last row, "New binder"
// (with a "+" in its dot), makes a new binder for the card.
function openBinderMenu() {
  const binders = loadBinderList();
  binderMenuList.replaceChildren();
  for (const binder of binders) {
    const count = Object.keys(loadBinder(binder.id)).length;
    const full = count >= binderPages(binder.id) * POCKETS_PER_PAGE;

    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'binder-menu-item';
    row.disabled = full;
    row.dataset.id = binder.id;

    const dot = document.createElement('span');
    dot.className = `binder-menu-dot cover-${cleanCover(binder.cover)}`;
    const name = document.createElement('span');
    name.className = 'binder-menu-name';
    name.textContent = binder.name;
    const detail = document.createElement('span');
    detail.className = 'binder-menu-count';
    detail.textContent = full ? 'Full' : `${count} ${count === 1 ? 'card' : 'cards'}`;

    row.append(dot, name, detail);
    row.addEventListener('click', () => addCardToBinder(binder.id, null));
    binderMenuList.appendChild(row);
  }

  // The "New binder" row at the bottom. Its dot is a white, bold "+" in a
  // circle (drawn by cardsearch.css), the same size as the color dots.
  // Picking it opens the New binder window (binder-dialog.js), and
  // "Create binder" there runs addCardToNewBinder.
  const newRow = document.createElement('button');
  newRow.type = 'button';
  newRow.className = 'binder-menu-item binder-menu-new';
  const plusDot = document.createElement('span');
  plusDot.className = 'binder-menu-dot binder-menu-plus';
  const newName = document.createElement('span');
  newName.className = 'binder-menu-name';
  newName.textContent = 'New binder';
  newRow.append(plusDot, newName);
  newRow.addEventListener('click', () => {
    closeBinderMenu(false);
    openNewBinderDialog(addCardToNewBinder);
  });
  binderMenuList.appendChild(newRow);

  binderMenu.hidden = false;
  binderButton.setAttribute('aria-expanded', 'true');
  // Put the keyboard on the first binder that can be picked.
  const first = binderMenuList.querySelector('.binder-menu-item:not(:disabled)');
  if (first) first.focus();
}

// Close the menu. "returnFocus" puts the keyboard back on the "+" button
// (after Escape or clicking "+" again), so keyboard users don't get lost.
function closeBinderMenu(returnFocus) {
  if (binderMenu.hidden) return;
  binderMenu.hidden = true;
  binderButton.setAttribute('aria-expanded', 'false');
  if (returnFocus) binderButton.focus();
}

// Escape closes the menu.
binderMenu.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeBinderMenu(true);
});

// Up and down arrow keys move between the binders in the menu (skipping
// full ones), wrapping around at the ends.
binderMenu.addEventListener('keydown', (event) => {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
  event.preventDefault();
  const rows = [...binderMenuList.querySelectorAll('.binder-menu-item:not(:disabled)')];
  if (rows.length === 0) return;
  const here = rows.indexOf(document.activeElement);
  const step = event.key === 'ArrowDown' ? 1 : -1;
  rows[(here + step + rows.length) % rows.length].focus();
});

// Clicking anywhere outside the menu (and outside the "+") closes it.
document.addEventListener('click', (event) => {
  if (binderMenu.hidden) return;
  if (binderMenu.contains(event.target) || binderButton.contains(event.target)) return;
  closeBinderMenu(false);
});

/* ----- Putting the card into a binder ----- */

// Save the card being shown (this exact set, version, side and language)
// into a binder, then go to that binder, opened to the page with the new
// card. "pocket" is the pocket to fill ({ page, slot }), or null for the
// binder's first empty pocket. (The binder page then saves the change to
// Google Drive.)
async function addCardToBinder(binderId, pocket) {
  const print = state.currentPrint;
  if (!print) return;
  if (!binderId) {
    setHint('Open one of your binders first (My Binders, at the bottom of the page).', true);
    return;
  }

  // A binder picked from the menu may have been changed on another
  // computer (or never opened in this browser), so get its latest cards
  // from Google Drive first: otherwise the card could land in a pocket
  // that's already taken, and saving could wipe out cards. (Coming from
  // the binder page, it's already up to date.)
  if (!OPENED_FROM_BINDER) {
    const rows = binderMenuList.querySelectorAll('.binder-menu-item');
    rows.forEach((row) => { row.disabled = true; });
    setHint('Getting your binder from Google Drive…');
    try {
      await syncBinder(binderId);   // google-drive.js
    } catch (err) {
      // Signed out (or offline): only go ahead if this browser already has
      // a copy of the binder to add to.
      if (storageGet(CARDS_KEY_PREFIX + binderId) === null) {
        setHint(err.signedOut
          ? 'Sign in again on My Binders (at the bottom of the page), then try again.'
          : `Couldn't get your binder from Google Drive. ${err.message}`, true);
        closeBinderMenu(true);
        return;
      }
    }
  }

  const cards = loadBinder(binderId);
  pocket = pocket || firstEmptyPocket(cards, binderPages(binderId));
  if (!pocket) {
    setHint('That binder is full. Click a card in the binder to replace it.', true);
    closeBinderMenu(true);
    return;
  }

  cards[pocketKey(pocket.page, pocket.slot)] = shownCardEntry();

  if (!saveBinder(cards, binderId)) {
    setHint('Your browser blocked saving, so the card could not be added.', true);
    closeBinderMenu(true);
    return;
  }
  location.href = `binder.html?binder=${encodeURIComponent(binderId)}&page=${pocket.page}`;
}

// The card being shown, as a binder saves it: this exact set, version,
// side and language, plus the picture to show in the pocket.
function shownCardEntry() {
  const print = state.currentPrint;
  // Only the side being shown counts as "the back" for double-sided cards.
  const face = isDoubleSided(print) ? state.currentFace : 0;
  // The language version being shown (its picture is in that language).
  const shown = state.shownCard;
  return {
    name: print.name,
    set: print.set,
    number: print.collector_number,
    face: face,
    lang: shown.lang !== print.lang ? shown.lang : undefined,   // only saved if switched
    image: binderImageFor(shown, face)
  };
}

// "Create binder" in the New binder window: make the new binder in Google
// Drive with the chosen name, cover symbol ("color", or null for none) and
// cover color, with the card in its first pocket, then open it. It goes at
// the end of the shelf on My Binders.
async function addCardToNewBinder(name, color, cover) {
  if (!state.currentPrint) return;
  const binders = loadBinderList();
  binderButton.disabled = true;   // no second click while it's being made
  setHint('Making the new binder…');
  try {
    const cards = { [pocketKey(1, 1)]: shownCardEntry() };
    const file = await createBinderFile(name, cards, color, binders.length, cover);   // google-drive.js
    binders.push({ id: file.id, name, color, cover, pages: DEFAULT_PAGES });
    saveBinderList(binders);
    saveBinder(cards, file.id, { dirty: false });   // Drive already has these cards
    location.href = `binder.html?binder=${encodeURIComponent(file.id)}&page=1`;
  } catch (err) {
    setHint(err.signedOut
      ? 'Sign in again on My Binders (at the bottom of the page), then try again.'
      : `Couldn't make the new binder in Google Drive. ${err.message}`, true);
    binderButton.disabled = false;
  }
}

/* =====================================================================
   STARTUP — everything that runs once when the page opens
   ===================================================================== */

// Make the switch match the theme chosen by the early script in <head>.
themeSwitch.setAttribute('aria-checked', String(root.getAttribute('data-theme') === 'dark'));

// Put the pickers in their empty state and show the back of a card.
resetCardDetails();
showCardBack();

// Start downloading the set symbols and card names in the background.
// We keep the set-symbol "promise" so card lookups can wait for it.
const setIconsReady = loadSetIcons();
loadCardNames();

// Finally, open the shared card if the link included one.
openSharedLinkIfAny();

// The "Sign out" link at the bottom right (google-drive.js saves any
// unsaved changes first). Afterwards, go to the sign-in screen.
setUpFooterSignOut(() => { location.href = 'index.html'; });
