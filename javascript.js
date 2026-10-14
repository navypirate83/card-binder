/* =========================================================================
   javascript.js — all the code that makes index.html (the Card Binder)
   work: the light/dark switch, building the pockets, turning pages, and
   downloading / uploading the binder as a .JSON file.
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
const downloadButton = document.getElementById('downloadJson');
const uploadButton   = document.getElementById('uploadJson');
const fileInput      = document.getElementById('jsonFileInput');

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
    // Turn off the browser's own "drag a picture or link" feature: we
    // handle dragging cards between pockets ourselves (see DRAGGING CARDS).
    img.draggable = false;
    link.draggable = false;
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
  if (drag) return;                   // the finger was dragging a card, not swiping
  const moveX = event.changedTouches[0].clientX - touchStartX;
  const moveY = event.changedTouches[0].clientY - touchStartY;
  if (Math.abs(moveX) < SWIPE_DISTANCE || Math.abs(moveX) < Math.abs(moveY)) return;
  turnPage(moveX < 0 ? -1 : 1);
});

/* =====================================================================
   DRAGGING CARDS BETWEEN POCKETS
   Pick up a card and drop it on another pocket to move it there. Drop it
   on a pocket that already has a card and the two cards swap places.
   Hold a dragged card at the left or right edge of the binder to turn
   the page, so you can move a card to a different page.
   While dragging, a red circle with an X appears in the middle of the
   binder: drop the card on it to remove the card from the binder.

   - With a mouse: press on a card and move it. A plain click (no
     movement) still opens the card in the card search, like before.
   - On a phone: press and HOLD a card for a moment until it lifts, then
     slide it. A quick swipe still turns the page, and a tap still opens
     the card in the card search.
   - Press Escape (or drop it outside the pockets) to put it back.
   ===================================================================== */

// How far the mouse must move (in pixels) before a press becomes a drag.
// Anything less is treated as a normal click.
const DRAG_START_DISTANCE = 6;

// How long (milliseconds) a finger must hold still on a card to pick it up.
const HOLD_TO_DRAG_MS = 350;

// How far a finger can wander while holding before it counts as a swipe
// or scroll instead of a hold.
const HOLD_WOBBLE = 10;

// How close to the binder's left or right edge (in pixels) the card must
// be held to turn the page. This is about the width of the binder's border
// and padding, so it doesn't reach into the pockets themselves.
// Anywhere past the edge (outside the binder) counts too.
const EDGE_ZONE = 18;

// How long the card must be held at an edge before the page turns, and how
// long to wait before turning again if it's still being held there.
const EDGE_WAIT_MS = 550;

// The red "remove card" circle in the middle of the binder, and how close
// (in pixels from its center) the pointer must be to count as "over" it.
// That's a bit more than the circle's 32px radius, so it's easy to hit.
const trash = document.getElementById('binderTrash');
const TRASH_REACH = 44;

// The drag in progress, or null when nothing is being dragged. It holds:
//  - fromKey:   the pocket the card came from, like "3-5"
//  - ghost:     the floating copy of the card that follows the pointer
//  - grabX/Y:   where on the card it was grabbed, so it doesn't jump
//  - target:    the pocket currently under the card (or null)
//  - overTrash: true while the card is over the red "remove" circle
//  - edge:      -1 / 1 while held at the left / right edge, else 0
let drag = null;

// A mouse press that might become a drag (before it has moved far enough).
let pendingMouse = null;

// The timer for a finger hold on a phone, and where the finger went down.
let holdTimer = null;
let holdStart = null;

// The timer that turns the page while a card is held at an edge.
let edgeTimer = null;

// When the last drag ended. A click straight after a drag is ignored, so
// dropping a card doesn't also open it in the card search.
let lastDragEnd = 0;

// Find a pocket element from its key, like "3-5".
function pocketElement(key) {
  const [page, slot] = key.split('-');
  return binder.querySelector(`.pocket[data-page="${page}"][data-slot="${slot}"]`);
}

// The key ("3-5") of a pocket element.
function keyOf(pocket) {
  return pocketKey(pocket.dataset.page, pocket.dataset.slot);
}

// Rebuild what's inside one pocket after its card has changed.
function refreshPocket(key) {
  const pocket = pocketElement(key);
  if (!pocket) return;
  pocket.replaceChildren();
  fillPocket(pocket, Number(pocket.dataset.page), Number(pocket.dataset.slot));
}

// The real (visible) pocket under a point on the screen, if any.
// The floating card ignores the pointer, so this "sees" through it.
function pocketAt(x, y) {
  const element = document.elementFromPoint(x, y);
  const pocket = element && element.closest('.pocket');
  // Skip the copies on a turning page: only real pockets in the binder count.
  return pocket && !pocket.closest('.flipper') && binder.contains(pocket) ? pocket : null;
}

// Pick up the card in a pocket. (x, y) is where the pointer is.
function beginDrag(pocket, x, y) {
  const card = binderCards[keyOf(pocket)];
  if (!card) return;

  // Make the floating copy, the same size as the pocket, and remember
  // where on the card it was grabbed.
  const box = pocket.getBoundingClientRect();
  const ghost = document.createElement('div');
  ghost.className = 'drag-ghost';
  ghost.style.width = `${box.width}px`;
  ghost.style.height = `${box.height}px`;
  const img = document.createElement('img');
  img.src = card.image;
  img.alt = '';
  ghost.appendChild(img);
  document.body.appendChild(ghost);

  drag = {
    fromKey: keyOf(pocket),
    ghost,
    grabX: x - box.left,
    grabY: y - box.top,
    target: null,
    overTrash: false,
    edge: 0
  };

  pocket.classList.add('drag-source');       // dim the card left behind
  document.body.classList.add('dragging');   // "grabbing hand" cursor everywhere
  moveDrag(x, y);
}

// Move the floating card to follow the pointer, highlight the pocket under
// it, and check whether it's being held at an edge of the binder.
function moveDrag(x, y) {
  if (!drag) return;
  drag.ghost.style.transform =
    `translate(${x - drag.grabX}px, ${y - drag.grabY}px) rotate(3deg) scale(1.06)`;

  // Over the red "remove" circle? Light it up. It sits on top of the
  // pockets, so while over it, no pocket counts as the drop target.
  drag.overTrash = isOverTrash(x, y);
  trash.classList.toggle('active', drag.overTrash);
  drag.ghost.classList.toggle('over-trash', drag.overTrash);   // fade the card so the X shows

  // Highlight the pocket the card would drop into.
  const target = drag.overTrash ? null : pocketAt(x, y);
  if (target !== drag.target) {
    if (drag.target) drag.target.classList.remove('drop-target');
    if (target && keyOf(target) !== drag.fromKey) target.classList.add('drop-target');
    drag.target = target;
  }

  // Is the card at (or past) the binder's left or right edge?
  const box = binder.getBoundingClientRect();
  const nearHeight = y > box.top - 40 && y < box.bottom + 40;
  let edge = 0;
  if (nearHeight && x < box.left + EDGE_ZONE) edge = -1;
  if (nearHeight && x > box.right - EDGE_ZONE) edge = 1;
  setEdge(edge);
}

// Start or stop the "turn the page" countdown when the card reaches or
// leaves an edge. The binder's edge glows while the countdown runs.
function setEdge(edge) {
  if (edge === drag.edge) return;
  drag.edge = edge;
  binder.classList.toggle('edge-left', edge === -1);
  binder.classList.toggle('edge-right', edge === 1);
  clearTimeout(edgeTimer);
  if (edge !== 0) edgeTimer = setTimeout(turnFromEdge, EDGE_WAIT_MS);
}

// Turn the page toward the edge the card is held at (if there's a page
// that way), then keep turning while it stays there.
function turnFromEdge() {
  if (!drag || drag.edge === 0) return;
  turnPage(drag.edge);   // does nothing at the first or last page
  edgeTimer = setTimeout(turnFromEdge, TURN_MS + EDGE_WAIT_MS);
}

// Is the point (x, y) within reach of the red "remove" circle's center?
function isOverTrash(x, y) {
  const box = trash.getBoundingClientRect();
  if (box.width === 0) return false;   // circle not showing
  const centerX = box.left + box.width / 2;
  const centerY = box.top + box.height / 2;
  return Math.hypot(x - centerX, y - centerY) <= TRASH_REACH;
}

// Let go of the card.
//  - Over the red circle: remove the card from the binder.
//  - Over another pocket: move it there (or swap with the card there).
//  - Anywhere else: it goes back where it was.
function endDrag(x, y) {
  if (!drag) return;
  const removing = isOverTrash(x, y);
  const target = removing ? null : pocketAt(x, y);
  const fromKey = drag.fromKey;
  const toKey = target ? keyOf(target) : null;
  finishDrag();

  if (removing) {
    const removed = binderCards[fromKey];
    delete binderCards[fromKey];
    if (!saveBinder(binderCards)) {
      binderCards[fromKey] = removed;   // saving failed: keep the card
      alert('Your browser blocked saving, so the card could not be removed.');
      return;
    }
    refreshPocket(fromKey);             // the pocket goes back to a "+"
    return;
  }

  if (!toKey || toKey === fromKey) return;   // dropped nowhere new

  // Move the card, and the card that was there (if any) to the old pocket.
  const moving = binderCards[fromKey];
  const swapped = binderCards[toKey];
  binderCards[toKey] = moving;
  if (swapped) binderCards[fromKey] = swapped;
  else delete binderCards[fromKey];

  if (!saveBinder(binderCards)) {
    // Saving failed: undo the move so the page matches what's saved.
    binderCards[fromKey] = moving;
    if (swapped) binderCards[toKey] = swapped;
    else delete binderCards[toKey];
    alert('Your browser blocked saving, so the card could not be moved.');
    return;
  }
  refreshPocket(fromKey);
  refreshPocket(toKey);
}

// Clean up after a drag: remove the floating card, highlights and timers.
function finishDrag() {
  if (!drag) return;
  drag.ghost.remove();
  if (drag.target) drag.target.classList.remove('drop-target');
  trash.classList.remove('active');
  const source = pocketElement(drag.fromKey);
  if (source) source.classList.remove('drag-source');
  clearTimeout(edgeTimer);
  binder.classList.remove('edge-left', 'edge-right');
  document.body.classList.remove('dragging');
  drag = null;
  lastDragEnd = Date.now();
}

// --- With a mouse (or pen) -------------------------------------------

// Pressing on a card: remember it, but don't start dragging until the
// mouse has moved a little, so a simple click still works.
binder.addEventListener('pointerdown', (event) => {
  if (event.pointerType === 'touch' || event.button !== 0) return;   // left button only
  const pocket = event.target.closest('.pocket');
  if (!pocket || !binderCards[keyOf(pocket)] || turning) return;
  event.preventDefault();   // stop the browser selecting text while dragging
  pendingMouse = { pocket, x: event.clientX, y: event.clientY };
});

// Moving the mouse: start the drag once it has moved far enough, then
// keep the floating card following it.
window.addEventListener('pointermove', (event) => {
  if (event.pointerType === 'touch') return;
  if (pendingMouse) {
    const moved = Math.hypot(event.clientX - pendingMouse.x, event.clientY - pendingMouse.y);
    if (moved >= DRAG_START_DISTANCE) {
      beginDrag(pendingMouse.pocket, pendingMouse.x, pendingMouse.y);
      pendingMouse = null;
    }
  }
  moveDrag(event.clientX, event.clientY);
});

// Letting go of the mouse button: drop the card.
window.addEventListener('pointerup', (event) => {
  if (event.pointerType === 'touch') return;
  pendingMouse = null;
  endDrag(event.clientX, event.clientY);
});

// --- With a finger (phones and tablets) -------------------------------

// Touching a card starts the "hold" countdown. If the finger stays put
// long enough, the card lifts and can be dragged.
binder.addEventListener('touchstart', (event) => {
  if (event.touches.length !== 1 || turning) return;
  const pocket = event.target.closest('.pocket');
  if (!pocket || !binderCards[keyOf(pocket)]) return;
  const touch = event.touches[0];
  holdStart = { x: touch.clientX, y: touch.clientY };
  clearTimeout(holdTimer);
  holdTimer = setTimeout(() => {
    holdTimer = null;
    beginDrag(pocket, holdStart.x, holdStart.y);
    if (navigator.vibrate) navigator.vibrate(15);   // a tiny buzz, on phones that can
  }, HOLD_TO_DRAG_MS);
}, { passive: true });

// Moving the finger: before the card lifts, moving too far cancels the hold
// (it was a swipe or scroll). Once lifted, the card follows the finger,
// and "preventDefault" stops the page scrolling at the same time.
// ("passive: false" is needed so preventDefault is allowed.)
binder.addEventListener('touchmove', (event) => {
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

// Lifting the finger: drop the card (or just cancel a hold that never lifted).
binder.addEventListener('touchend', (event) => {
  clearTimeout(holdTimer);
  holdTimer = null;
  if (drag) {
    const touch = event.changedTouches[0];
    endDrag(touch.clientX, touch.clientY);
  }
});

// The phone interrupted the touch (for example a call came in): put the
// card back where it was.
binder.addEventListener('touchcancel', () => {
  clearTimeout(holdTimer);
  holdTimer = null;
  finishDrag();
});

// --- Both ----------------------------------------------------------------

// Escape puts the card back where it came from.
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    pendingMouse = null;
    finishDrag();
  }
});

// If the browser window loses focus mid-drag (for example the mouse was
// let go outside the window, or you switched apps), put the card back too.
window.addEventListener('blur', () => {
  pendingMouse = null;
  finishDrag();
});

// Ignore the click that browsers send right after a drag ends, so dropping
// a card doesn't also open it in the card search. ("true" = catch the click
// on its way down, before the link sees it.)
binder.addEventListener('click', (event) => {
  if (drag || Date.now() - lastDragEnd < 400) {
    event.preventDefault();
    event.stopPropagation();
  }
}, true);

// A long press on a phone normally opens a menu (Save image, Open link…).
// Block that menu on cards, since a long press now picks the card up.
binder.addEventListener('contextmenu', (event) => {
  if (event.target.closest('.pocket-card')) event.preventDefault();
});

// When the page opens, start on the page named in the address, if any.
// cardsearch.html sends you back to "index.html?page=3" after adding a
// card to page 3, so you see the new card right away. Otherwise page 1.
const startPage = parseInt(new URLSearchParams(location.search).get('page'), 10);
if (startPage >= 1 && startPage <= TOTAL_PAGES) currentPage = startPage;
showPages();

/* =====================================================================
   DOWNLOAD / UPLOAD THE BINDER AS A .JSON FILE
   JSON is a plain-text way of writing down data. The file looks like:
     {
       "app": "mtg-card-binder",
       "version": 1,
       "exportedAt": "2026-10-13T18:30:00.000Z",
       "cards": { "1-1": { "name": "...", "set": "...", ... }, ... }
     }
   where "1-1" means page 1, pocket 1. You can keep it as a backup, or
   upload it on another computer or browser to bring your binder there.
   ===================================================================== */

// The name written into the file, so we can recognize our own files.
const FILE_APP_NAME = 'mtg-card-binder';

// DOWNLOAD: turn the saved cards into a .json file and save it.
// The browser saves files from a link, so we make an invisible link to
// the file's contents, "click" it, then clean up.
downloadButton.addEventListener('click', () => {
  const data = {
    app: FILE_APP_NAME,
    version: 1,
    exportedAt: new Date().toISOString(),
    cards: loadBinder()
  };
  // JSON.stringify writes the data as text; the "2" adds indenting so the
  // file is easy to read in a text editor.
  const file = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(file);
  link.download = `card-binder-${new Date().toISOString().slice(0, 10)}.json`;  // e.g. card-binder-2026-10-13.json
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);   // free the memory the file was using
});

// UPLOAD: the Upload button opens the (hidden) file picker.
uploadButton.addEventListener('click', () => fileInput.click());

// Check one card from an uploaded file. A file could come from anywhere,
// so we only accept cards that have everything a pocket needs, with the
// picture coming from a secure "https://" address.
function isValidCard(card) {
  return card !== null && typeof card === 'object' &&
    typeof card.name === 'string' &&
    typeof card.set === 'string' &&
    typeof card.number === 'string' &&
    typeof card.image === 'string' && card.image.startsWith('https://') &&
    (card.face === 0 || card.face === 1) &&
    (card.lang === undefined || typeof card.lang === 'string');
}

// Read a chosen file, check it, and put its cards into the binder.
fileInput.addEventListener('change', async () => {
  const chosen = fileInput.files[0];
  fileInput.value = '';             // so picking the same file again still works
  if (!chosen) return;              // the picker was closed without a file

  // Read the file's text and turn it back into data.
  let data;
  try {
    data = JSON.parse(await chosen.text());
  } catch (e) {
    alert('That file isn\'t a readable .JSON file.');
    return;
  }

  // Accept our own download format ({ cards: {...} }) or just the cards
  // by themselves ({ "1-1": {...}, ... }).
  const incoming = data && typeof data === 'object' && data.cards ? data.cards : data;
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
    alert('That file doesn\'t contain any binder cards.');
    return;
  }

  // Keep only the valid cards in pockets that exist (like "3-5").
  const cards = {};
  let skipped = 0;
  for (const [key, card] of Object.entries(incoming)) {
    const match = /^(\d+)-(\d+)$/.exec(key);
    const page = match ? Number(match[1]) : 0;
    const slot = match ? Number(match[2]) : 0;
    const pocketExists = page >= 1 && page <= TOTAL_PAGES && slot >= 1 && slot <= POCKETS_PER_PAGE;
    if (pocketExists && isValidCard(card)) cards[pocketKey(page, slot)] = card;
    else skipped++;
  }

  const count = Object.keys(cards).length;
  if (count === 0) {
    alert('No usable cards were found in that file.');
    return;
  }

  // Uploading REPLACES the binder, so check first if it already has cards.
  const current = Object.keys(loadBinder()).length;
  if (current > 0 && !confirm(
    `Replace the ${current} card${current === 1 ? '' : 's'} in your binder ` +
    `with the ${count} card${count === 1 ? '' : 's'} from this file?`)) {
    return;
  }

  if (!saveBinder(cards)) {
    alert('Your browser blocked saving, so the binder could not be loaded.');
    return;
  }
  if (skipped > 0) {
    alert(`Loaded ${count} cards. ${skipped} entr${skipped === 1 ? 'y was' : 'ies were'} skipped because ${skipped === 1 ? 'it wasn\'t' : 'they weren\'t'} valid.`);
  }
  // Reload the page so every pocket is rebuilt from the new cards.
  // Keep the same page open by putting it in the address.
  location.href = `index.html?page=${currentPage}`;
});
