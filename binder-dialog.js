/* =========================================================================
   binder-dialog.js — the "New binder" window, and the pieces the binder
   windows share
   Used by the My Binders page (index.html, with landing.js) and the MTG
   Card Finder page (cardsearch.html, with cardsearch.js). Both pages have
   the same New binder window in their HTML; this file fills in its choices
   and runs it. The page decides what happens with the new binder (see
   openNewBinderDialog below).
   Load it after binder-storage.js (it uses MANA_COLORS, COVER_COLORS,
   DEFAULT_COVER, cleanCover and nextBinderName from there).
   ========================================================================= */

/* =====================================================================
   PIECES SHARED BY THE WINDOWS (New binder and Binder properties)
   ===================================================================== */

// Fill a window's symbol choices, in two parts:
//  - "None", the five colors, Colorless and Planeswalker (two rows of 4)
//  - under a small "Two colors" heading, the ten two-color symbols (two rows of 5)
// Each choice is a radio button (only one in the whole set can be picked)
// wrapped in a label, so clicking the symbol or its name picks it.
// "container" is where they go; "groupName" ties one window's radio
// buttons together (the New binder and Properties windows each have a set).
function buildColorChoices(container, groupName) {
  const singleRow = document.createElement('div');
  singleRow.className = 'color-grid';
  const twoHeading = document.createElement('p');
  twoHeading.className = 'choice-group-title';
  twoHeading.textContent = 'Two colors';
  const twoRows = document.createElement('div');
  twoRows.className = 'color-grid two-colors';
  container.append(singleRow, twoHeading, twoRows);

  const options = [{ code: '', name: 'None', short: 'None', group: 'single', symbol: null }, ...MANA_COLORS];
  for (const option of options) {
    const choice = document.createElement('label');
    choice.className = 'color-choice';
    choice.title = option.name;      // hovering shows the full name, e.g. "White and Blue"

    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = groupName;
    radio.value = option.code;
    // Screen readers say the full name and the short one ("White and Blue, Azorius").
    if (option.short !== option.name) radio.setAttribute('aria-label', `${option.name}, ${option.short}`);

    // The picture: the color's symbol, or an empty circle for "None".
    let picture;
    if (option.symbol) {
      picture = document.createElement('img');
      picture.src = option.symbol;
      picture.alt = '';                 // the name below says which color
    } else {
      picture = document.createElement('span');
      picture.className = 'no-symbol';
    }
    picture.classList.add('choice-symbol');

    const label = document.createElement('span');
    label.className = 'choice-name';
    label.textContent = option.short;

    choice.append(radio, picture, label);
    (option.group === 'two' ? twoRows : singleRow).appendChild(choice);
  }
}

// Fill a window's cover color choices: one round swatch for each of the
// seven colors in COVER_COLORS, with its name under it. Like the symbols,
// each is a radio button inside a label, so clicking the swatch picks it.
// The swatch uses the same "cover-<color>" class as the shelf's binders,
// so it looks just like the cover will.
function buildCoverChoices(container, groupName) {
  for (const option of COVER_COLORS) {
    const choice = document.createElement('label');
    choice.className = 'color-choice';
    choice.title = option.name;

    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = groupName;
    radio.value = option.code;

    const swatch = document.createElement('span');
    swatch.className = `cover-swatch cover-${option.code}`;

    const label = document.createElement('span');
    label.className = 'choice-name';
    label.textContent = option.name;

    choice.append(radio, swatch, label);
    container.appendChild(choice);
  }
}

// Keep a name box's "5 / 12" counter up to date (characters used of the
// box's limit). Used by both the New binder and Binder properties windows.
function showNameCount(input, counter) {
  counter.textContent = `${input.value.length} / ${input.maxLength}`;
}

// Clicking on the dimmed area outside a window closes it, like Cancel / No.
// (A click on the dimmed area counts as a click on the <dialog> itself.)
function closeOnBackdropClick(dialog) {
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close('cancel');
  });
}

/* =====================================================================
   THE "NEW BINDER" WINDOW
   ===================================================================== */

const newBinderDialog = document.getElementById('newBinderDialog');
const newBinderName   = document.getElementById('newBinderName');    // the name box
const newNameCount    = document.getElementById('newNameCount');     // ...and its "5 / 12" counter

// What to do when "Create binder" is clicked. Each page passes its own
// when it opens the window: My Binders makes an empty binder; the card
// finder makes one with the card being shown in it.
let whenNewBinderCreated = null;

// Fill in the window's choices once, when the page loads.
buildColorChoices(document.getElementById('colorChoices'), 'binderColor');
buildCoverChoices(document.getElementById('coverChoices'), 'binderCover');
newBinderName.addEventListener('input', () => showNameCount(newBinderName, newNameCount));

// Open the window with the next free name filled in (and selected, so
// typing replaces it), "None" picked for the symbol and black for the
// cover color. "onCreate(name, color, cover)" runs if "Create binder" is
// clicked: color is a symbol code (or null for none), cover a cover color.
function openNewBinderDialog(onCreate) {
  whenNewBinderCreated = onCreate;
  newBinderName.value = nextBinderName();
  showNameCount(newBinderName, newNameCount);
  newBinderDialog.querySelector('input[name="binderColor"][value=""]').checked = true;
  newBinderDialog.querySelector(`input[name="binderCover"][value="${DEFAULT_COVER}"]`).checked = true;
  // Forget which button closed the window last time, so closing it with
  // Escape now can't count as an old "Create binder".
  newBinderDialog.returnValue = '';
  newBinderDialog.showModal();
  newBinderName.select();
}

// When the window closes, see which button closed it. "Create binder"
// hands the typed name, the picked symbol ("" means none) and the picked
// cover color to the page; Cancel does nothing. (The name box is
// "required", so it can't be blank; spaces-only still falls back to the
// default name.)
newBinderDialog.addEventListener('close', () => {
  const onCreate = whenNewBinderCreated;
  whenNewBinderCreated = null;
  if (newBinderDialog.returnValue !== 'create' || !onCreate) return;
  const picked = newBinderDialog.querySelector('input[name="binderColor"]:checked');
  const pickedCover = newBinderDialog.querySelector('input[name="binderCover"]:checked');
  const name = newBinderName.value.trim().slice(0, newBinderName.maxLength) || nextBinderName();
  onCreate(name, picked && picked.value ? picked.value : null, cleanCover(pickedCover && pickedCover.value));
});
closeOnBackdropClick(newBinderDialog);
