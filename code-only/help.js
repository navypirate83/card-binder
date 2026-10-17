const root        = document.documentElement;
const themeSwitch = document.getElementById('themeSwitch');

function setTheme(theme) {
  root.setAttribute('data-theme', theme);
  themeSwitch.setAttribute('aria-checked', String(theme === 'dark'));
  storageSet('theme', theme);
}

themeSwitch.addEventListener('click', () => {
  setTheme(root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
});

themeSwitch.setAttribute('aria-checked', String(root.getAttribute('data-theme') === 'dark'));

const loggedIn = isLoggedIn();
document.getElementById('myBindersItem').hidden = !loggedIn;
document.getElementById('homeItem').hidden = loggedIn;

const articles   = [...document.querySelectorAll('.help-article')];
const topicLinks = [...document.querySelectorAll('.help-nav a')];

function showTopic() {
  const target = location.hash ? document.getElementById(location.hash.slice(1)) : null;
  const article = (target && target.closest('.help-article')) || articles[0];

  for (const a of articles) a.hidden = a !== article;

  for (const link of topicLinks) {
    const id = link.getAttribute('href').slice(1);
    const picked = id === article.id || (target && id === target.id);
    if (picked) link.setAttribute('aria-current', 'true');
    else link.removeAttribute('aria-current');
  }
  for (const item of document.querySelectorAll('.help-topics > li')) {
    const topic = item.querySelector('.help-topic');
    item.classList.toggle('open', topic.getAttribute('href') === `#${article.id}`);
  }

  if (target && target !== article) target.scrollIntoView({ block: 'start' });
  else window.scrollTo(0, 0);
}

window.addEventListener('hashchange', showTopic);
showTopic();
