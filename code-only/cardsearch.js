const API = 'https://api.scryfall.com';

const CARD_BACK = 'https://backs.scryfall.io/large/0/a/0aeebaf5-8c7d-4636-9e82-8c27447861f7.jpg';
const CARD_BACK_ALT = 'Back of a Magic: The Gathering card';

const MIN_CHARS = 3;

const TYPING_PAUSE_MS = 120;
const REQUEST_GAP_MS = 100;
const TOAST_MS = 2000;

const EMPTY_PICKER_TEXT = 'Search for a card first';

const root          = document.documentElement;
const themeSwitch   = document.getElementById('themeSwitch');
const searchInput   = document.getElementById('searchInput');
const suggestionsEl = document.getElementById('suggestions');
const hint          = document.getElementById('hint');
const cardFrame     = document.getElementById('cardFrame');
const cardImage     = document.getElementById('cardImage');
const shareButton   = document.getElementById('shareButton');
const shareToast    = document.getElementById('shareToast');
const binderButton  = document.getElementById('binderButton');
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

const LOGGED_IN = isLoggedIn();

const state = {
  allNames: [],
  suggestions: [],
  activeSuggestion: -1,
  setIcons: new Map(),
  printsBySet: [],
  currentSet: null,
  currentPrint: null,
  currentFace: 0,
  languages: [],
  shownCard: null,
  languageToken: 0,
  wantedLanguage: null,
  activeSetIndex: -1,
  loadToken: 0
};

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

  let at = nameCompact.indexOf(typedCompact);
  for (let pos = at; pos !== -1; pos = nameCompact.indexOf(typedCompact, pos + 1)) {
    if (startsWord(pos)) { at = pos; break; }
  }
  if (at === -1) return escapeHtml(name);

  const start = origin[at];
  const end = origin[at + typedCompact.length - 1] + 1;
  return escapeHtml(name.slice(0, start)) +
         '<mark>' + escapeHtml(name.slice(start, end)) + '</mark>' +
         escapeHtml(name.slice(end));
}

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

function hideSuggestions() {
  suggestionsEl.hidden = true;
  suggestionsEl.innerHTML = '';
  state.suggestions = [];
  state.activeSuggestion = -1;
  searchInput.setAttribute('aria-expanded', 'false');
  searchInput.removeAttribute('aria-activedescendant');
}

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

function chooseSuggestion(name) {
  cancelPendingSearch();
  searchInput.value = name;
  hideSuggestions();
  loadCardByName(name, true);
}

let typingTimer = null;

function cancelPendingSearch() {
  clearTimeout(typingTimer);
  typingTimer = null;
}

searchInput.addEventListener('input', () => {
  cancelPendingSearch();
  const text = searchInput.value;
  if (text.trim().length < MIN_CHARS) { hideSuggestions(); return; }

  const timer = setTimeout(async () => {
    const names = await findSuggestions(text);
    if (typingTimer === timer) renderSuggestions(names);
  }, TYPING_PAUSE_MS);
  typingTimer = timer;
});

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
      cancelPendingSearch();
      hideSuggestions();
      loadCardByName(searchInput.value.trim(), false);
    }
  } else if (event.key === 'Escape') {
    cancelPendingSearch();
    hideSuggestions();
  }
});

suggestionsEl.addEventListener('mousedown', (event) => {
  event.preventDefault();
  const li = event.target.closest('li');
  if (li) chooseSuggestion(state.suggestions[Number(li.dataset.index)]);
});

searchInput.addEventListener('blur', () => {
  cancelPendingSearch();
  hideSuggestions();
});

function loadCardByName(name, exact) {
  const mode = exact ? 'exact' : 'fuzzy';
  return openCard(`/cards/named?${mode}=${encodeURIComponent(name)}`, 0);
}

function loadCardBySetAndNumber(setCode, number, face) {
  return openCard(`/cards/${encodeURIComponent(setCode)}/${encodeURIComponent(number)}`, face);
}

async function openCard(lookupPath, face) {
  const myToken = ++state.loadToken;
  setHint('Loading…');
  cardFrame.classList.add('loading');

  try {
    const card = await scryfall(lookupPath);
    const prints = await fetchAllPages(card.prints_search_uri);
    await setIconsReady;

    if (myToken !== state.loadToken) return;

    searchInput.value = card.name;
    state.printsBySet = groupBySet(prints);

    const startSet = state.printsBySet.find((s) => s.code === card.set) || state.printsBySet[0];
    const startPrint = startSet.prints.find((p) => p.id === card.id) || startSet.prints[0];

    setHint(`${plural(prints.length, 'printing')} across ${plural(state.printsBySet.length, 'set')}.`);
    selectSet(startSet, startPrint);
    if (face === 1) showFace(1);

    loadRulings(card.rulings_uri, myToken);
  } catch (err) {
    if (myToken !== state.loadToken) return;
    setHint(err.message || 'Something went wrong.', true);
    resetCardDetails();
    showCardBack();
  }
}

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
  state.languageToken++;
  state.wantedLanguage = null;
  languageSelect.disabled = true;
  languageSelect.innerHTML = `<option>${EMPTY_PICKER_TEXT}</option>`;
  flipButton.hidden = true;
  shareButton.hidden = true;
  binderButton.hidden = true;
  cardInfo.innerHTML = '';
  rulingsBox.hidden = true;
  rulingsBody.innerHTML = '';
  legalityBox.hidden = true;
  legalityList.replaceChildren();
}

const RULING_SOURCES = { wotc: 'Wizards of the Coast', scryfall: 'Scryfall' };

function formatDate(isoDate) {
  return new Date(isoDate).toLocaleDateString(undefined,
    { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function showRulingsMessage(message) {
  rulingsBody.innerHTML = `<p class="rulings-message">${escapeHtml(message)}</p>`;
}

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

function setRowHtml(set) {
  const icon = set.icon
    ? `<img class="set-icon" src="${escapeHtml(set.icon)}" alt="">`
    : '<span class="set-icon"></span>';
  return `${icon}<span class="sep">|</span>` +
         `<span class="set-code">${escapeHtml(set.code.toUpperCase())}</span>` +
         '<span class="sep">|</span>' +
         `<span class="set-name">${escapeHtml(set.name)}</span>`;
}

function selectSet(set, print = set.prints[0]) {
  state.currentSet = set;
  setButton.disabled = false;
  setButton.innerHTML = setRowHtml(set);

  setList.innerHTML = state.printsBySet.map((s, i) =>
    `<li id="set-option-${i}" role="option" data-index="${i}" aria-selected="${s === set}">` +
    `${setRowHtml(s)}</li>`
  ).join('');

  versionSelect.disabled = false;
  versionSelect.innerHTML = set.prints.map((p) =>
    `<option value="${escapeHtml(p.id)}">${escapeHtml(versionLabel(p))}</option>`
  ).join('');

  selectPrint(print);
}

function openSetList() {
  setList.hidden = false;
  setButton.setAttribute('aria-expanded', 'true');
  setActiveSet(state.printsBySet.indexOf(state.currentSet));
  setList.focus();
}

function closeSetList(returnFocus) {
  setList.hidden = true;
  setButton.setAttribute('aria-expanded', 'false');
  if (returnFocus) setButton.focus();
}

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

function chooseSet(index) {
  const set = state.printsBySet[index];
  if (set) selectSet(set);
  closeSetList(true);
}

setButton.addEventListener('click', () => {
  if (setList.hidden) openSetList();
  else closeSetList(true);
});

setButton.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    openSetList();
  }
});

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

setList.addEventListener('click', (event) => {
  const li = event.target.closest('li');
  if (li) chooseSet(Number(li.dataset.index));
});

document.addEventListener('click', (event) => {
  if (!setList.hidden && !event.target.closest('.set-picker')) closeSetList(false);
});

const FRAME_EFFECT_NAMES = {
  showcase: 'Showcase',
  extendedart: 'Extended Art',
  inverted: 'Inverted'
};

function versionLabel(print) {
  const styles = [];
  if (print.border_color === 'borderless') styles.push('Borderless');
  if (print.full_art) styles.push('Full Art');
  if (print.textless) styles.push('Textless');
  const oldFrame = print.frame === '1993' || print.frame === '1997';
  if (oldFrame && Number(print.released_at.slice(0, 4)) > 2003) styles.push('Retro Frame');
  for (const effect of print.frame_effects || []) {
    if (FRAME_EFFECT_NAMES[effect]) styles.push(FRAME_EFFECT_NAMES[effect]);
  }
  if (print.promo) styles.push('Promo');

  const finishes = (print.finishes || []).map((f) => f[0].toUpperCase() + f.slice(1));

  const parts = [`#${print.collector_number}`];
  if (styles.length) parts.push(styles.join(', '));
  if (finishes.length) parts.push(finishes.join(' / '));
  if (print.lang && print.lang !== 'en') parts.push(print.lang.toUpperCase());
  return parts.join(' · ');
}

versionSelect.addEventListener('change', () => {
  const print = state.currentSet.prints.find((p) => p.id === versionSelect.value);
  if (print) selectPrint(print);
});

function isDoubleSided(print) {
  const faces = print.card_faces || [];
  return !print.image_uris && faces.length > 1 && Boolean(faces[1].image_uris);
}

function selectPrint(print) {
  state.currentPrint = print;
  state.shownCard = print;
  versionSelect.value = print.id;
  loadLanguages(print);
  flipButton.hidden = !isDoubleSided(print);
  shareButton.hidden = false;
  binderButton.hidden = !LOGGED_IN;
  showFace(0);
  cardInfo.innerHTML =
    `<strong>${escapeHtml(print.name)}</strong><br>` +
    `${escapeHtml(print.set_name)} · #${escapeHtml(print.collector_number)}` +
    (print.artist ? ` · Illustrated by ${escapeHtml(print.artist)}` : '') +
    `<br><a href="${escapeHtml(print.scryfall_uri)}" target="_blank" rel="noopener">View on Scryfall</a>`;
  showLegalities(print);
}

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

const LEGALITY_WORDS = {
  legal: 'Legal',
  not_legal: 'Not Legal',
  banned: 'Banned',
  restricted: 'Restricted'
};

function showLegalities(print) {
  const legalities = print.legalities || {};
  legalityList.replaceChildren();

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
    tag.className = `legality-status ${LEGALITY_WORDS[status] ? status : 'not_legal'}`;
    tag.textContent = LEGALITY_WORDS[status] || String(status);
    item.append(label, tag);
    legalityList.appendChild(item);
  }
  legalityBox.hidden = formats.length === 0;
}

const LANGUAGE_NAMES = {
  en: 'English', es: 'Spanish', fr: 'French', de: 'German', it: 'Italian',
  pt: 'Portuguese', ja: 'Japanese', ko: 'Korean', ru: 'Russian',
  zhs: 'Chinese (Simplified)', zht: 'Chinese (Traditional)', he: 'Hebrew',
  la: 'Latin', grc: 'Ancient Greek', ar: 'Arabic', sa: 'Sanskrit',
  ph: 'Phyrexian', qya: 'Quenya'
};

function languageName(code) {
  return LANGUAGE_NAMES[code] || String(code).toUpperCase();
}

async function loadLanguages(print) {
  const myToken = ++state.languageToken;

  languageSelect.disabled = true;
  languageSelect.innerHTML =
    `<option value="${escapeHtml(print.lang)}">${escapeHtml(languageName(print.lang))}</option>`;

  let versions;
  try {
    const query = `set:${print.set} cn:"${print.collector_number}" lang:any`;
    versions = await fetchAllPages(
      `/cards/search?unique=prints&q=${encodeURIComponent(query)}`);
  } catch (err) {
    versions = [];
  }

  if (myToken !== state.languageToken) return;

  if (!versions.some((v) => v.lang === print.lang)) versions.push(print);
  versions.sort((a, b) =>
    (b.lang === 'en') - (a.lang === 'en') ||
    languageName(a.lang).localeCompare(languageName(b.lang)));
  state.languages = versions;

  languageSelect.innerHTML = versions.map((v) =>
    `<option value="${escapeHtml(v.lang)}">${escapeHtml(languageName(v.lang))}</option>`
  ).join('');
  languageSelect.value = state.shownCard.lang;
  languageSelect.disabled = versions.length < 2;

  if (state.wantedLanguage) {
    const wanted = state.wantedLanguage;
    state.wantedLanguage = null;
    if (wanted !== state.shownCard.lang && versions.some((v) => v.lang === wanted)) {
      languageSelect.value = wanted;
      showLanguage(wanted);
    }
  }
}

function showLanguage(code) {
  const version = state.languages.find((v) => v.lang === code);
  if (!version) return;
  state.shownCard = version;
  showFace(state.currentFace);
}

languageSelect.addEventListener('change', () => showLanguage(languageSelect.value));

function showFace(face) {
  const print = state.currentPrint;
  if (!print || (face === 1 && !isDoubleSided(print))) return;
  state.currentFace = face;
  showCardImage(state.shownCard, face);
}

flipButton.addEventListener('click', () => showFace(state.currentFace === 0 ? 1 : 0));

function imageFor(print, face, sizes = ['large', 'normal']) {
  if (print.image_status === 'missing' || print.image_status === 'placeholder') return null;
  const uris = print.image_uris || (print.card_faces && print.card_faces[face].image_uris);
  if (!uris) return null;
  const size = sizes.find((s) => uris[s]);
  return size ? uris[size] : null;
}

function setPicture(url, alt) {
  cardImage.alt = alt;
  if (cardImage.src === url) {
    cardFrame.classList.remove('loading');
    return;
  }
  cardFrame.classList.add('loading');
  cardImage.src = url;
}

function showCardImage(print, face) {
  const url = imageFor(print, face);
  if (!url) { showCardBack(); return; }
  const faceName = isDoubleSided(print) ? print.card_faces[face].name : print.name;
  setPicture(url, `${faceName} — ${print.set_name}`);
}

function showCardBack() {
  setPicture(CARD_BACK, CARD_BACK_ALT);
}

cardImage.addEventListener('load', () => cardFrame.classList.remove('loading'));

cardImage.addEventListener('error', () => {
  if (cardImage.src !== CARD_BACK) showCardBack();
  else cardFrame.classList.remove('loading');
});

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

let toastTimer = null;
function showToast(message) {
  shareToast.textContent = message;
  shareToast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { shareToast.hidden = true; }, TOAST_MS);
}

shareButton.addEventListener('click', async () => {
  if (!state.currentPrint) return;
  const url = shareLink();
  const title = `${state.currentPrint.name} — ${state.currentPrint.set_name}`;

  if (navigator.share) {
    try {
      await navigator.share({ title, text: title, url });
      return;
    } catch (err) {
      if (err.name === 'AbortError') return;
    }
  }

  try {
    await navigator.clipboard.writeText(url);
    showToast('Link copied!');
  } catch (err) {
    window.prompt('Copy this link to share the card:', url);
  }
});

function openSharedLinkIfAny() {
  const params = new URLSearchParams(location.search);
  const setCode = params.get('set');
  const number = params.get('number');
  state.wantedLanguage = params.get('lang');
  if (setCode && number) {
    loadCardBySetAndNumber(setCode, number, params.get('face') === 'back' ? 1 : 0);
  }
}

const targetBinderId = currentBinderId() || storageGet(LAST_BINDER_KEY) || null;

document.getElementById('myBindersItem').hidden = !LOGGED_IN;

if (LOGGED_IN && targetBinderId) {
  const backLink = document.getElementById('backToBinderLink');
  backLink.textContent = binderName(targetBinderId);
  backLink.href = `binder.html?binder=${encodeURIComponent(targetBinderId)}`;
  document.getElementById('backToBinderItem').hidden = false;
}

const binderTarget = (() => {
  const params = new URLSearchParams(location.search);
  const page = parseInt(params.get('binderPage'), 10);
  const slot = parseInt(params.get('binderSlot'), 10);
  const valid = page >= 1 && page <= MAX_PAGES && slot >= 1 && slot <= POCKETS_PER_PAGE;
  return valid ? { page, slot } : null;
})();

function binderImageFor(print, face) {
  return imageFor(print, face, ['normal', 'large']) || CARD_BACK;
}

binderButton.addEventListener('click', () => {
  const print = state.currentPrint;
  if (!print || !LOGGED_IN) return;
  if (!targetBinderId) {
    setHint('Open one of your binders first (My Binders, at the bottom of the page).', true);
    return;
  }

  const cards = loadBinder(targetBinderId);
  const pocket = binderTarget || firstEmptyPocket(cards, binderPages(targetBinderId));
  if (!pocket) {
    setHint('Your binder is full. Click a card in the binder to replace it.', true);
    return;
  }

  const face = isDoubleSided(print) ? state.currentFace : 0;
  const shown = state.shownCard;
  cards[pocketKey(pocket.page, pocket.slot)] = {
    name: print.name,
    set: print.set,
    number: print.collector_number,
    face: face,
    lang: shown.lang !== print.lang ? shown.lang : undefined,
    image: binderImageFor(shown, face)
  };

  if (!saveBinder(cards, targetBinderId)) {
    setHint('Your browser blocked saving, so the card could not be added.', true);
    return;
  }
  location.href = `binder.html?binder=${encodeURIComponent(targetBinderId)}&page=${pocket.page}`;
});

themeSwitch.setAttribute('aria-checked', String(root.getAttribute('data-theme') === 'dark'));

resetCardDetails();
showCardBack();

const setIconsReady = loadSetIcons();
loadCardNames();

openSharedLinkIfAny();

setUpFooterSignOut(() => { location.href = 'index.html'; });
