/* =========================================================================
   binder-dialog.js — the "New binder" window, and the pieces the binder
   windows share
   Used by the My Binders page (index.html, with landing.js) and the MTG
   Card Finder page (cardsearch.html, with cardsearch.js). Both pages have
   the same New binder window in their HTML; this file fills in its choices
   and runs it. The page decides what happens with the new binder (see
   openNewBinderDialog below).
   Load it after binder-storage.js (it uses MANA_COLORS, COVER_COLORS,
   DEFAULT_COVER, cleanCover, isCustomCover and nextBinderName from there).
   It also has the code that colors a binder cover (applyCoverColor), used
   by the shelf, the windows and the card finder's menu.
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

/* ----- Cover colors ----- */

// Color a cover-shaped element (a binder on the shelf, a swatch, a menu
// dot) with a cover color code:
//  - one of COVER_COLORS ("gold"): give it that color's "cover-gold" class,
//    whose shades are in binder-dialog.css
//  - a custom color ("#3a7bd5"): work out its shades here and set them on
//    the element itself (the same --cover-light / --cover-base /
//    --cover-dark / --cover-edge names the classes use)
// Pale covers also get the "light-cover" class, so the name label on them
// uses dark text.
function applyCoverColor(element, code) {
  code = cleanCover(code);
  // Take off any earlier cover color first.
  for (const name of [...element.classList]) {
    if (name.startsWith('cover-') && name !== 'cover-swatch') element.classList.remove(name);
  }
  for (const shade of ['--cover-light', '--cover-base', '--cover-dark', '--cover-edge']) {
    element.style.removeProperty(shade);
  }

  let light;
  if (isCustomCover(code)) {
    element.style.setProperty('--cover-light', mixColors(code, '#ffffff', 0.25));   // a quarter white
    element.style.setProperty('--cover-base', code);
    element.style.setProperty('--cover-dark', mixColors(code, '#000000', 0.45));    // nearly half black
    element.style.setProperty('--cover-edge', mixColors(code, '#000000', 0.2));
    light = brightness(code) > 0.6;
  } else {
    element.classList.add(`cover-${code}`);
    light = COVER_COLORS.find((c) => c.code === code).light === true;
  }
  element.classList.toggle('light-cover', light);
}

// The readable name of a cover color code, e.g. "gray" -> "Light gray",
// or "Custom color" for a color picked with the color chooser.
function coverColorName(code) {
  code = cleanCover(code);
  return isCustomCover(code) ? 'Custom color' : COVER_COLORS.find((c) => c.code === code).name;
}

// Split "#3a7bd5" into its red, green and blue amounts (each 0 to 255).
function colorParts(hex) {
  return [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16));
}

// Blend two colors: "amount" of the way from the first to the second
// (0.25 = a quarter of the way). Gives back a "#rrggbb" code.
function mixColors(hex, towards, amount) {
  const from = colorParts(hex);
  const to = colorParts(towards);
  return '#' + from.map((value, i) => {
    const mixed = Math.round(value + (to[i] - value) * amount);
    return mixed.toString(16).padStart(2, '0');
  }).join('');
}

// How bright a color looks, from 0 (black) to 1 (white). Green looks
// brighter to our eyes than red, and red than blue, so they count
// differently (the usual "perceived brightness" weights).
function brightness(hex) {
  const [r, g, b] = colorParts(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

// Fill a window's cover color choices: one round swatch for each color in
// COVER_COLORS, with its name under it, then "Custom" for any other color.
// Like the symbols, each is a radio button inside a label, so clicking the
// swatch picks it. The swatches are colored the same way as the shelf's
// binders (applyCoverColor), so they look just like the cover will.
// "Custom" opens the device's own color chooser (a hidden
// <input type="color">); its swatch shows a rainbow until a color is picked,
// then that color.
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
    swatch.className = 'cover-swatch';
    applyCoverColor(swatch, option.code);

    const label = document.createElement('span');
    label.className = 'choice-name';
    label.textContent = option.name;

    choice.append(radio, swatch, label);
    container.appendChild(choice);
  }

  // The "Custom" choice.
  const choice = document.createElement('label');
  choice.className = 'color-choice custom-cover-choice';
  choice.title = 'Pick any color';

  const radio = document.createElement('input');
  radio.type = 'radio';
  radio.name = groupName;
  radio.value = 'custom';
  radio.setAttribute('aria-label', 'Custom color (opens a color chooser)');

  const swatch = document.createElement('span');
  swatch.className = 'cover-swatch custom-unset';   // the rainbow (binder-dialog.css)

  // The device's color chooser. It's invisible (see binder-dialog.css) but
  // still on the page, so it can be opened from code.
  const chooser = document.createElement('input');
  chooser.type = 'color';
  chooser.className = 'custom-cover-input';
  chooser.tabIndex = -1;                     // reached through the radio button
  chooser.setAttribute('aria-hidden', 'true');
  chooser.value = '#7a4fb3';

  const label = document.createElement('span');
  label.className = 'choice-name';
  label.textContent = 'Custom';

  // Clicking "Custom" picks it and opens the color chooser. ("showPicker"
  // is the newer way to open it; older browsers use a pretend click.)
  radio.addEventListener('click', () => {
    try { chooser.showPicker(); } catch (e) { chooser.click(); }
  });
  // A color was picked: show it in the swatch (and make sure Custom is picked).
  chooser.addEventListener('input', () => {
    swatch.classList.remove('custom-unset');
    applyCoverColor(swatch, chooser.value);
    radio.checked = true;
  });

  choice.append(radio, swatch, chooser, label);
  container.appendChild(choice);
}

// Which cover color is picked in a window's choices: a COVER_COLORS code,
// or the custom color's code (like "#3a7bd5") when "Custom" is picked.
function pickedCoverColor(container) {
  const picked = container.querySelector('input[type="radio"]:checked');
  if (!picked) return DEFAULT_COVER;
  if (picked.value === 'custom') return cleanCover(container.querySelector('.custom-cover-input').value);
  return cleanCover(picked.value);
}

// Pick a cover color in a window's choices (when the window opens). A
// custom color picks "Custom" and shows that color in its swatch; any other
// color resets "Custom" back to its rainbow.
function setPickedCoverColor(container, code) {
  code = cleanCover(code);
  const customSwatch = container.querySelector('.custom-cover-choice .cover-swatch');
  const chooser = container.querySelector('.custom-cover-input');
  if (isCustomCover(code)) {
    chooser.value = code;
    customSwatch.classList.remove('custom-unset');
    applyCoverColor(customSwatch, code);
    container.querySelector('input[value="custom"]').checked = true;
  } else {
    applyCoverColor(customSwatch, DEFAULT_COVER);
    customSwatch.classList.remove('cover-black');   // no cover class: the rainbow shows
    customSwatch.classList.add('custom-unset');
    container.querySelector(`input[type="radio"][value="${code}"]`).checked = true;
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
const coverChoices    = document.getElementById('coverChoices');      // the cover color choices
const newBinderName   = document.getElementById('newBinderName');    // the name box
const newNameCount    = document.getElementById('newNameCount');     // ...and its "5 / 12" counter

// What to do when "Create binder" is clicked. Each page passes its own
// when it opens the window: My Binders makes an empty binder; the card
// finder makes one with the card being shown in it.
let whenNewBinderCreated = null;

// Fill in the window's choices once, when the page loads.
buildColorChoices(document.getElementById('colorChoices'), 'binderColor');
buildCoverChoices(coverChoices, 'binderCover');
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
  setPickedCoverColor(coverChoices, DEFAULT_COVER);
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
  const name = newBinderName.value.trim().slice(0, newBinderName.maxLength) || nextBinderName();
  onCreate(name, picked && picked.value ? picked.value : null, pickedCoverColor(coverChoices));
});
closeOnBackdropClick(newBinderDialog);
