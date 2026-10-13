/* =========================================================================
   javascript.js — all the code that makes index.html (the Card Binder)
   work: the light/dark switch, building the pockets, and turning pages.
   It's loaded at the bottom of index.html, after the page's HTML exists,
   and after binder-storage.js (which it uses to load saved cards).
   ========================================================================= */

/* =====================================================================
   FINDING THE PAGE ELEMENTS
   ===================================================================== */

const root        = document.documentElement;   // the <html> tag
const themeSwitch = document.getElementById('themeSwitch');
const binder      = document.getElementById('binder');
const prevButton  = document.getElementById('prevPage');
const nextButton  = document.getElementById('nextPage');
const pageStatus  = document.getElementById('pageStatus');

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
   BUILDING THE BINDER POCKETS
   ===================================================================== */

// TOTAL_PAGES, POCKETS_PER_PAGE, loadBinder() and pocketKey() come from
// binder-storage.js (loaded just before this file in index.html), which
// cardsearch.html shares, so both pages agree on the binder's size.

// The cards saved in the binder, e.g. { "3-5": { name, set, ... } }.
const binderCards = loadBinder();

// Build the link to cardsearch.html for one pocket. The page and pocket
// numbers ride along in the link, so when "Add to binder" is clicked
// over there, the card lands in this exact pocket.
// If the pocket already holds a card, the link also says which card to
// open (the same set / number / face / language format as a shared link).
function searchLinkFor(page, slot, card) {
  const params = new URLSearchParams();
  if (card) {
    params.set('set', card.set);
    params.set('number', card.number);
    if (card.face === 1) params.set('face', 'back');
    if (card.lang) params.set('lang', card.lang);   // e.g. "ja" for Japanese
  }
  params.set('binderPage', page);
  params.set('binderSlot', slot);
  return `cardsearch.html?${params}`;
}

// Put the right thing inside a pocket:
//  - a saved card: its picture, which links to that card on cardsearch.html
//  - nothing saved: a white "+" link to cardsearch.html to pick a card
function fillPocket(pocket, page, slot) {
  const card = binderCards[pocketKey(page, slot)];
  const link = document.createElement('a');
  link.href = searchLinkFor(page, slot, card);

  if (card) {
    link.className = 'pocket-card';
    link.setAttribute('aria-label', `${card.name}, pocket ${slot}. Open in card search`);
    const img = document.createElement('img');
    img.src = card.image;
    img.alt = '';                 // the link's label already names the card
    // Download every card picture right away, even on pages you can't see
    // yet, so the cards are already there when you turn to their page.
    // (We don't use loading="lazy": some phone browsers never load lazy
    // pictures that start on a hidden page, leaving those pockets blank.)
    img.loading = 'eager';
    link.appendChild(img);
  } else {
    link.className = 'pocket-add';
    link.setAttribute('aria-label', `Add a card to pocket ${slot}`);
    link.textContent = '+';
  }

  pocket.appendChild(link);
}

// Create every page and fill each one with its pockets. Each pocket gets:
//  - data-page: which page it's on (1 to TOTAL_PAGES)
//  - data-slot: its spot on that page, 1 to 16, counting left-to-right,
//    top-to-bottom.
function buildPages() {
  for (let pageNumber = 1; pageNumber <= TOTAL_PAGES; pageNumber++) {
    const page = document.createElement('div');
    page.className = 'binder-page';
    page.dataset.page = pageNumber;
    page.setAttribute('aria-label', `Page ${pageNumber}`);

    for (let slot = 1; slot <= POCKETS_PER_PAGE; slot++) {
      const pocket = document.createElement('div');
      pocket.className = 'pocket';
      pocket.dataset.page = pageNumber;
      pocket.dataset.slot = slot;
      fillPocket(pocket, pageNumber, slot);
      page.appendChild(pocket);
    }

    binder.appendChild(page);
  }
}

buildPages();

/* =====================================================================
   TURNING PAGES
   ===================================================================== */

// A "media query" we can check from the script: true when the screen is
// phone-sized. Keep 640px the same as the @media rule in style.css.
const PHONE_QUERY = window.matchMedia('(max-width: 640px)');

// The page number shown first (on the left when two pages are showing).
let currentPage = 1;

// How many pages fit on screen right now: 1 on a phone, 2 on bigger screens.
function pagesShown() {
  return PHONE_QUERY.matches ? 1 : 2;
}

// Show only the page(s) that belong on screen, hide the rest, and update
// the page number and the Previous / Next links.
function showPages() {
  const count = pagesShown();

  // With two pages showing, the left page is always an odd number
  // (1–2, 3–4, ...), like a real binder opened flat. If we just came
  // from a phone sitting on, say, page 4, step back to page 3.
  if (count === 2 && currentPage % 2 === 0) currentPage--;

  const lastShown = Math.min(currentPage + count - 1, TOTAL_PAGES);

  // Show the page(s) from currentPage to lastShown, hide the rest.
  const numbers = [];
  for (let n = currentPage; n <= lastShown; n++) numbers.push(n);
  showOnly(numbers);

  // "Page 3 of 10" on a phone, "Pages 3–4 of 10" on bigger screens.
  pageStatus.textContent = currentPage === lastShown
    ? `Page ${currentPage} of ${TOTAL_PAGES}`
    : `Pages ${currentPage}–${lastShown} of ${TOTAL_PAGES}`;

  // Grey out a link when there's no page in that direction.
  prevButton.disabled = currentPage <= 1;
  nextButton.disabled = lastShown >= TOTAL_PAGES;
}

// Find a page's element by its number (or null if there's no such page).
function pageElement(number) {
  return binder.querySelector(`.binder-page[data-page="${number}"]`);
}

// Show exactly the pages in the list (e.g. [3, 4]) and hide all others.
// The binder's grid places the shown pages left-to-right in page order.
function showOnly(numbers) {
  binder.querySelectorAll('.binder-page').forEach((page) => {
    page.hidden = !numbers.includes(Number(page.dataset.page));
  });
}

/* =====================================================================
   PAGE TURNING ANIMATION
   ===================================================================== */

// How long one page turn takes, in milliseconds (1000 = 1 second).
const TURN_MS = 650;

// True while a page is mid-turn, so extra clicks or swipes wait their turn.
let turning = false;

// People who turn on "reduce motion" in their system settings get an
// instant page change instead of the animation.
const REDUCE_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)');

// Make a copy of a page to use as one side of the turning page.
// With no page given, make a plain blank page back instead.
function pageCopy(number) {
  const original = number ? pageElement(number) : null;
  if (!original) {
    const blank = document.createElement('div');
    blank.className = 'blank-page';
    return blank;
  }
  const copy = original.cloneNode(true);
  copy.hidden = false;
  copy.removeAttribute('aria-label');
  return copy;
}

// Build one side of the turning page: the page copy plus a shade layer.
function flipFace(sideClass, content) {
  const face = document.createElement('div');
  face.className = `flip-face ${sideClass}`;
  const shade = document.createElement('div');
  shade.className = 'flip-shade';
  face.append(content, shade);
  return face;
}

// Make a soft shadow laid over one page-sized spot of the binder: darkest
// along the spine and fading out toward the outer edge, like the shadow a
// lifted page casts. "spineSide" is which edge of the spot is at the spine.
function castShadow(spot, spineSide) {
  const shadow = document.createElement('div');
  shadow.className = 'turn-shadow';
  Object.assign(shadow.style, {
    left: `${spot.left}px`, top: `${spot.top}px`,
    width: `${spot.width}px`, height: `${spot.height}px`,
    // The gradient runs AWAY from the spine: dark at the spine, clear by 75%.
    background: `linear-gradient(to ${spineSide === 'left' ? 'right' : 'left'},
      rgba(0, 0, 0, 0.6), rgba(0, 0, 0, 0.25) 35%, rgba(0, 0, 0, 0) 75%)`
  });
  binder.appendChild(shadow);
  return shadow;
}

// Where a page element sits inside the binder (its left/top edge and size).
function spotOf(element) {
  return {
    left: element.offsetLeft, top: element.offsetTop,
    width: element.offsetWidth, height: element.offsetHeight
  };
}

// Run one page turn. The settings say:
//  - cover:    the page element the turning page starts on top of
//  - front:    page number on the front of the turning page (null = blank)
//  - back:     page number on its back (null = blank)
//  - under:    the page numbers to show underneath while it turns
//  - hinge:    which edge it swings on: 'left' or 'right' (the spine side)
//  - from, to: start and end angles (0 = lying flat, ±180 = turned over)
//  - landing:  the page element on the other side of the spine, where a
//              page turned over to ±180 comes to rest (null on phones,
//              where that spot is off the screen)
//  - fade:     'out' to fade it away at the end, 'in' to fade in at the start
//  - done:     what to do once it lands
//
// The turn happens in TWO halves. In the first half the page lifts until it
// stands straight up (edge-on, so you can't see either side). Right then we
// swap which side is showing, and in the second half the page comes down.
// That way only ONE side is ever drawn at a time, so the cards on one side
// can never show through to the other.
async function animateTurn({ cover, front, back, under, hinge, from, to, landing, fade, done }) {
  // Measure where the covered page sits inside the binder.
  const spot = spotOf(cover);
  const otherSide = hinge === 'left' ? 'right' : 'left';

  // Build the turning page and lay it exactly over that spot.
  const flipper = document.createElement('div');
  flipper.className = 'flipper';
  flipper.setAttribute('aria-hidden', 'true');   // screen readers skip it
  Object.assign(flipper.style, {
    left: `${spot.left}px`, top: `${spot.top}px`,
    width: `${spot.width}px`, height: `${spot.height}px`,
    transformOrigin: `${hinge} center`
  });
  const frontFace = flipFace('flip-front', pageCopy(front));
  const backFace = flipFace('flip-back', pageCopy(back));
  flipper.append(frontFace, backFace);

  // Which side faces up at the start? Lying flat (0°) = the front;
  // turned over (±180°) = the back. Only that side is drawn for now.
  const startsOnBack = Math.abs(from) > 90;
  frontFace.hidden = startsOnBack;
  backFace.hidden = !startsOnBack;

  // Shadows on the binder underneath:
  //  - where the page starts flat: a shadow that fades as it lifts away
  //  - where the page lands flat: a shadow that darkens as it comes down
  // A spot at 0° is the covered page; a spot at ±180° is the landing page.
  // (The landing page's spine is on its other edge.)
  const startShadow = from === 0 ? castShadow(spot, hinge)
    : landing ? castShadow(spotOf(landing), otherSide) : null;
  const endShadow = to === 0 ? castShadow(spot, hinge)
    : landing ? castShadow(spotOf(landing), otherSide) : null;
  if (endShadow) endShadow.style.opacity = 0;

  // Swap the real pages underneath to what will be revealed.
  showOnly(under);
  binder.appendChild(flipper);

  const half = TURN_MS / 2;
  const middle = (from + to) / 2;   // the straight-up angle (±90°)

  // FIRST HALF: lift the page until it stands straight up. "ease-in"
  // starts slowly and speeds up, like a page peeling off the binder.
  // On phones, a page coming back in also fades in during this half.
  const lift = flipper.animate([
    { transform: `rotateY(${from}deg)`, opacity: fade === 'in' ? 0 : 1 },
    { transform: `rotateY(${middle}deg)`, opacity: 1 }
  ], { duration: half, easing: 'ease-in', fill: 'forwards' });
  // The page darkens as it tilts away from the light...
  (startsOnBack ? backFace : frontFace).lastChild.animate(
    [{ opacity: 0 }, { opacity: 0.5 }], { duration: half, easing: 'ease-in', fill: 'forwards' });
  // ...and its shadow on the binder fades as it rises.
  if (startShadow) {
    startShadow.animate([{ opacity: 1 }, { opacity: 0 }],
      { duration: half, easing: 'ease-in', fill: 'forwards' });
  }
  await lift.finished;

  // HALFWAY: the page is edge-on. Show the other side instead.
  frontFace.hidden = !startsOnBack;
  backFace.hidden = startsOnBack;

  // SECOND HALF: bring the page down. "ease-out" starts fast and slows to
  // a gentle stop as it settles flat. On phones, a page swinging away also
  // fades out during this half.
  const settle = flipper.animate([
    { transform: `rotateY(${middle}deg)`, opacity: 1 },
    { transform: `rotateY(${to}deg)`, opacity: fade === 'out' ? 0 : 1 }
  ], { duration: half, easing: 'ease-out', fill: 'forwards' });
  // The newly showing side starts dark and brightens as it lies flat...
  (startsOnBack ? frontFace : backFace).lastChild.animate(
    [{ opacity: 0.5 }, { opacity: 0 }], { duration: half, easing: 'ease-out', fill: 'forwards' });
  // ...while its shadow on the binder darkens as it comes down.
  if (endShadow) {
    endShadow.animate([{ opacity: 0 }, { opacity: 1 }],
      { duration: half, easing: 'ease-out', fill: 'forwards' });
  }
  await settle.finished;

  // Landed: remove the turning page and shadows, and show the final pages.
  flipper.remove();
  if (startShadow) startShadow.remove();
  if (endShadow) endShadow.remove();
  done();
}

// Move forward (+1) or back (-1). On bigger screens that's two pages
// at a time, since you see two pages together.
function turnPage(direction) {
  if (turning) return;                              // still turning: wait
  const count = pagesShown();
  const from = currentPage;
  const target = currentPage + count * direction;
  if (target < 1 || target > TOTAL_PAGES) return;   // already at the end

  // What to do once the page has turned: show the new page(s).
  const finish = () => {
    currentPage = target;
    showPages();
    turning = false;
  };

  // No animation for "reduce motion", or if something's missing.
  if (REDUCE_MOTION.matches || !pageElement(from) || !binder.animate) {
    finish();
    return;
  }
  turning = true;

  if (count === 2 && direction === 1) {
    // TWO PAGES, FORWARD: the right page lifts and swings over the
    // spine to the left, like turning a book page. Its back is the
    // new left page. Underneath: the old left page stays, and the
    // new right page is revealed.
    const rightPage = pageElement(from + 1);
    if (!rightPage) { finish(); return; }
    animateTurn({
      cover: rightPage, front: from + 1, back: target,
      under: [from, target + 1], hinge: 'left', from: 0, to: -180,
      landing: pageElement(from), done: finish
    });
  } else if (count === 2) {
    // TWO PAGES, BACKWARD: the left page swings over the spine to the
    // right. Its back is the new right page. Underneath: the new left
    // page is revealed, and the old right page stays.
    animateTurn({
      cover: pageElement(from), front: from, back: target + 1,
      under: [target, from + 1], hinge: 'right', from: 0, to: 180,
      landing: pageElement(from + 1), done: finish
    });
  } else if (direction === 1) {
    // ONE PAGE (phone), FORWARD: the page swings away to the left and
    // fades out, revealing the next page underneath.
    animateTurn({
      cover: pageElement(from), front: from, back: null,
      under: [target], hinge: 'left', from: 0, to: -180, fade: 'out',
      done: finish
    });
  } else {
    // ONE PAGE (phone), BACKWARD: the previous page swings back in
    // from the left and lands on top of the current one.
    animateTurn({
      cover: pageElement(from), front: target, back: null,
      under: [from], hinge: 'left', from: -180, to: 0, fade: 'in',
      done: finish
    });
  }
}

// The Previous / Next links.
prevButton.addEventListener('click', () => turnPage(-1));
nextButton.addEventListener('click', () => turnPage(1));

// When the screen crosses between phone size and bigger (e.g. a phone
// turned sideways), redraw so it shows the right number of pages.
PHONE_QUERY.addEventListener('change', showPages);

/* =====================================================================
   SWIPING ON A PHONE
   ===================================================================== */

// How far (in pixels) a finger must slide sideways to count as a swipe.
const SWIPE_DISTANCE = 50;

// Where the finger first touched the binder.
let touchStartX = 0;
let touchStartY = 0;

// Remember where the finger went down.
binder.addEventListener('touchstart', (event) => {
  touchStartX = event.touches[0].clientX;
  touchStartY = event.touches[0].clientY;
}, { passive: true });

// When the finger lifts, see how far it moved.
//  - Swipe LEFT  (finger moved right-to-left) = previous page
//  - Swipe RIGHT (finger moved left-to-right) = next page
// A swipe only counts if it went far enough sideways and more sideways
// than up/down, so normal scrolling up and down doesn't turn the page.
binder.addEventListener('touchend', (event) => {
  if (!PHONE_QUERY.matches) return;   // swiping is for the phone layout only
  const moveX = event.changedTouches[0].clientX - touchStartX;
  const moveY = event.changedTouches[0].clientY - touchStartY;
  if (Math.abs(moveX) < SWIPE_DISTANCE || Math.abs(moveX) < Math.abs(moveY)) return;
  turnPage(moveX < 0 ? -1 : 1);
});

// When the page opens, start on the page named in the address, if any.
// cardsearch.html sends you back to "index.html?page=3" after adding a
// card to page 3, so you see the new card right away. Otherwise page 1.
const startPage = parseInt(new URLSearchParams(location.search).get('page'), 10);
if (startPage >= 1 && startPage <= TOTAL_PAGES) currentPage = startPage;
showPages();
