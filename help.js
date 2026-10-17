/* =====================================================================
   HELP PAGE (help.html)
   - the light/dark switch (same as the other pages)
   - the footer: "My Binders" or "Home"
   - the left column: clicking a topic shows that page's instructions
     in the wide right column (and jumps to the section clicked)
   storageSet (binder-storage.js) and isLoggedIn (google-drive.js) come
   from the shared files loaded before this one.
   ===================================================================== */

/* ---------------------------------------------------------------------
   LIGHT / DARK SWITCH
   --------------------------------------------------------------------- */

const root        = document.documentElement;   // the <html> tag
const themeSwitch = document.getElementById('themeSwitch');

// Apply a theme ("light" or "dark"), update the switch, and remember it,
// so every page of the site uses the same one.
function setTheme(theme) {
  root.setAttribute('data-theme', theme);
  themeSwitch.setAttribute('aria-checked', String(theme === 'dark'));
  storageSet('theme', theme);
}

// Clicking the switch flips between light and dark.
themeSwitch.addEventListener('click', () => {
  setTheme(root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
});

// When the page opens, make the switch match the theme already applied
// by the little script at the top of the page.
themeSwitch.setAttribute('aria-checked', String(root.getAttribute('data-theme') === 'dark'));

/* ---------------------------------------------------------------------
   FOOTER LINKS
   Someone using the binders (signed in, or using the site locally) gets
   "My Binders"; anyone else gets "Home", the sign-in page.
   --------------------------------------------------------------------- */

const loggedIn = isLoggedIn();
document.getElementById('myBindersItem').hidden = !loggedIn;
document.getElementById('homeItem').hidden = loggedIn;

/* ---------------------------------------------------------------------
   SHOWING A HELP TOPIC
   The address ends in the topic or section picked, like
   "help.html#binder-moving". That means: show the "Binder pages"
   instructions and scroll to its "Moving to another binder" section.
   Using the address means the browser's Back button steps back through
   the topics, and a link like help.html#finder opens straight to it.
   --------------------------------------------------------------------- */

const articles   = [...document.querySelectorAll('.help-article')];
const topicLinks = [...document.querySelectorAll('.help-nav a')];

// Show the topic for whatever the address points at (the first topic if
// it points at nothing we know), and highlight its links on the left.
function showTopic() {
  const target = location.hash ? document.getElementById(location.hash.slice(1)) : null;
  // The article the target is in (or is), or the first one.
  const article = (target && target.closest('.help-article')) || articles[0];

  // Show only that article.
  for (const a of articles) a.hidden = a !== article;

  // Highlight, on the left: the page's topic link, and the section link
  // that was picked (if one was). aria-current tells screen readers too.
  for (const link of topicLinks) {
    const id = link.getAttribute('href').slice(1);
    const picked = id === article.id || (target && id === target.id);
    if (picked) link.setAttribute('aria-current', 'true');
    else link.removeAttribute('aria-current');
  }
  // Open the section list under the page being shown; close the others.
  for (const item of document.querySelectorAll('.help-topics > li')) {
    const topic = item.querySelector('.help-topic');
    item.classList.toggle('open', topic.getAttribute('href') === `#${article.id}`);
  }

  // A section was picked: scroll it into view. A whole page was picked:
  // go back to the top, so its title shows.
  if (target && target !== article) target.scrollIntoView({ block: 'start' });
  else window.scrollTo(0, 0);
}

// Show the right topic when the page opens, and whenever a link on the
// left (or a link inside the instructions) changes the address.
window.addEventListener('hashchange', showTopic);
showTopic();
