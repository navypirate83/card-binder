const GOOGLE_CLIENT_ID = '595038767611-a97c7o5tcg348tis5pcbul562n1k0tnl.apps.googleusercontent.com';

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

const DRIVE_FOLDER_NAME = 'MTG Card Binder';

const TOKEN_KEY = 'googleToken';
const FOLDER_KEY = 'driveFolderId';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';

function googleIsConfigured() {
  return !GOOGLE_CLIENT_ID.startsWith('PASTE-');
}

function getAccessToken() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(TOKEN_KEY));
    if (saved && saved.expiresAt > Date.now() + 60 * 1000) return saved.accessToken;
  } catch (e) {  }
  return null;
}

function isSignedIn() {
  return getAccessToken() !== null;
}

function forgetAccessToken() {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(FOLDER_KEY);
  } catch (e) {  }
}

function signedOutError() {
  const err = new Error('Your Google sign-in has expired. Please sign in again.');
  err.signedOut = true;
  return err;
}

let tokenClient = null;

let googleSignInReady = null;

let pendingSignIn = null;

function whenGoogleLibraryReady() {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    (function check() {
      if (window.google && google.accounts && google.accounts.oauth2) resolve();
      else if (Date.now() - started > 10000) {
        reject(new Error('Google sign-in didn\'t load. Check your internet connection and reload the page.'));
      } else setTimeout(check, 100);
    })();
  });
}

function initGoogleSignIn() {
  if (!googleSignInReady) googleSignInReady = setUpGoogleSignIn();
  return googleSignInReady;
}
async function setUpGoogleSignIn() {
  if (!googleIsConfigured()) return;
  await whenGoogleLibraryReady();
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: DRIVE_SCOPE,
    callback: (response) => {
      const done = pendingSignIn;
      pendingSignIn = null;
      if (!done) return;
      if (response.error) {
        done.reject(new Error('Google sign-in didn\'t finish. Please try again.'));
        return;
      }
      try {
        sessionStorage.setItem(TOKEN_KEY, JSON.stringify({
          accessToken: response.access_token,
          expiresAt: Date.now() + Number(response.expires_in) * 1000
        }));
      } catch (e) {  }
      done.resolve(response.access_token);
    },
    error_callback: (error) => {
      const done = pendingSignIn;
      pendingSignIn = null;
      if (!done) return;
      done.reject(new Error(error && error.type === 'popup_closed'
        ? 'Sign-in was cancelled.'
        : 'Google\'s sign-in window couldn\'t open. Allow pop-ups for this site and try again.'));
    }
  });
}

function signInWithGoogle() {
  return new Promise((resolve, reject) => {
    if (!googleIsConfigured()) {
      reject(new Error('Google sign-in isn\'t set up yet: the Google Client ID still needs to be added to google-drive.js.'));
      return;
    }
    if (!tokenClient) {
      reject(new Error('Google sign-in is still loading. Please try again in a moment.'));
      return;
    }
    pendingSignIn = { resolve, reject };
    tokenClient.requestAccessToken();
  });
}

function signOutOfGoogle() {
  const token = getAccessToken();
  if (token && window.google && google.accounts && google.accounts.oauth2) {
    google.accounts.oauth2.revoke(token, () => {});
  }
  forgetAccessToken();
}

async function signOutAndForget() {
  const unsaved = loadBinderList().filter((b) => binderDirtyStamp(b.id));
  try {
    await Promise.all(unsaved.map((b) => syncBinder(b.id)));
  } catch (e) {
    if (!confirm('Some changes couldn\'t be saved to Google Drive and will be lost if you sign out. Sign out anyway?')) {
      return false;
    }
  }
  signOutOfGoogle();
  clearAllBinders();
  return true;
}

function isLoggedIn() {
  return isSignedIn() || isLocalMode() || loadBinderList().length > 0;
}

function setUpFooterSignOut(afterSignOut, afterSignIn = () => { location.href = 'index.html'; }) {
  const link = document.getElementById('footerSignOut');
  if (!link) return;
  showFooterAccountLink();
  if (isLocalMode()) initGoogleSignIn().catch(() => {  });

  link.addEventListener('click', async () => {
    link.disabled = true;
    if (isLocalMode()) {
      link.textContent = 'Signing in…';
      try {
        await signInWithGoogle();
        link.textContent = 'Uploading your binders…';
        await uploadLocalBinders();
        link.disabled = false;
        showFooterAccountLink();
        afterSignIn();
      } catch (err) {
        alert(err.message);
        link.disabled = false;
        showFooterAccountLink();
      }
      return;
    }
    link.textContent = 'Signing out…';
    const signedOut = await signOutAndForget();
    link.disabled = false;
    showFooterAccountLink();
    if (signedOut) afterSignOut();
  });
}

function showFooterAccountLink() {
  const link = document.getElementById('footerSignOut');
  if (!link) return;
  link.hidden = !isLoggedIn();
  if (isLocalMode()) {
    link.innerHTML = '<span class="label-long">Sign in with Google</span><span class="label-short">Sign in</span>';
    link.setAttribute('aria-label', 'Sign in with Google');
  } else {
    link.textContent = 'Sign out';
    link.removeAttribute('aria-label');
  }
}

async function driveRequest(url, options = {}) {
  const token = getAccessToken();
  if (!token) throw signedOutError();

  const response = await fetchOrExplain(url, {
    ...options,
    headers: { ...(options.headers || {}), Authorization: `Bearer ${token}` }
  }, 'Google Drive');
  if (response.status === 401) {
    forgetAccessToken();
    throw signedOutError();
  }
  if (!response.ok) {
    let message = `Google Drive error (${response.status}).`;
    try {
      const body = await response.json();
      if (body.error && body.error.message) message = `Google Drive: ${body.error.message}`;
    } catch (e) {  }
    throw new Error(message);
  }
  return response;
}

async function getDriveUser() {
  const response = await driveRequest(`${DRIVE_API}/about?fields=user(displayName,emailAddress)`);
  return (await response.json()).user;
}

async function getBinderFolderId() {
  try {
    const remembered = sessionStorage.getItem(FOLDER_KEY);
    if (remembered) return remembered;
  } catch (e) {  }

  const query = `name='${DRIVE_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const found = await driveRequest(
    `${DRIVE_API}/files?q=${encodeURIComponent(query)}&fields=files(id)&pageSize=1`);
  let folderId = ((await found.json()).files[0] || {}).id;

  if (!folderId) {
    const created = await driveRequest(`${DRIVE_API}/files?fields=id`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: DRIVE_FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' })
    });
    folderId = (await created.json()).id;
  }

  try { sessionStorage.setItem(FOLDER_KEY, folderId); } catch (e) {  }
  return folderId;
}

async function listBinderFiles() {
  const folderId = await getBinderFolderId();
  const query = `'${folderId}' in parents and mimeType='application/json' and trashed=false`;
  const files = [];
  let pageToken = '';
  do {
    const response = await driveRequest(
      `${DRIVE_API}/files?q=${encodeURIComponent(query)}` +
      `&fields=nextPageToken,files(id,name,appProperties)&orderBy=createdTime&pageSize=1000` +
      (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''));
    const batch = await response.json();
    files.push(...batch.files);
    pageToken = batch.nextPageToken || '';
  } while (pageToken);
  return files;
}

async function readBinderFile(fileId) {
  const response = await driveRequest(`${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media`);
  try {
    return await response.json();
  } catch (err) {
    throw new Error('This binder\'s file in Google Drive can\'t be read. It may have been edited or damaged.');
  }
}

async function writeBinderFile(fileId, data) {
  await driveRequest(`${DRIVE_UPLOAD_API}/files/${encodeURIComponent(fileId)}?uploadType=media`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data, null, 2)
  });
}

async function createBinderFile(name, cards = {}, color = null, order = null, cover = DEFAULT_COVER, pages = DEFAULT_PAGES) {
  if (isLocalMode()) return { id: newLocalBinderId(), name: `${name}.json` };
  const folderId = await getBinderFolderId();
  const boundary = `binder-${Date.now()}`;
  const data = { app: FILE_APP_NAME, version: 1, name, color, cover, pages, cards };
  const details = { name: `${name}.json`, mimeType: 'application/json', parents: [folderId] };
  const labels = {};
  if (color) labels.color = color;
  if (cover !== DEFAULT_COVER) labels.cover = cover;
  if (pages !== DEFAULT_PAGES) labels.pages = String(pages);
  if (order !== null) labels.order = String(order);
  if (Object.keys(labels).length) details.appProperties = labels;
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(details)}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n` +
    `${JSON.stringify(data, null, 2)}\r\n` +
    `--${boundary}--`;
  const response = await driveRequest(
    `${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id,name`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body
    });
  return response.json();
}

async function updateBinderDetails(fileId, { name, color, cover, pages, order } = {}) {
  if (isLocalMode()) return;
  const details = {};
  const labels = {};
  if (name !== undefined) details.name = `${name}.json`;
  if (color !== undefined) labels.color = color;
  if (cover !== undefined) labels.cover = cover;
  if (pages !== undefined) labels.pages = String(pages);
  if (order !== undefined) labels.order = String(order);
  if (Object.keys(labels).length) details.appProperties = labels;
  await driveRequest(`${DRIVE_API}/files/${encodeURIComponent(fileId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(details)
  });
}

async function trashBinderFile(fileId) {
  if (isLocalMode()) return;
  await driveRequest(`${DRIVE_API}/files/${encodeURIComponent(fileId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trashed: true })
  });
}

function nameFromFileName(fileName) {
  return fileName.replace(/\.json$/i, '');
}

async function syncBinder(id) {
  if (isLocalMode()) return loadBinder(id);
  const stamp = binderDirtyStamp(id);
  if (stamp) {
    await writeBinderFile(id, binderFileData(id));
    markBinderSaved(id, stamp);
    return loadBinder(id);
  }
  const data = await readBinderFile(id);
  const { cards } = cleanCards(data && data.cards);
  saveBinder(cards, id, { dirty: false });
  return cards;
}

async function uploadLocalBinders() {
  const localBinders = loadBinderList();
  setLocalMode(false);
  try {
    const alreadyInDrive = (await listBinderFiles()).length;
    for (const [index, binder] of localBinders.entries()) {
      await createBinderFile(binder.name, loadBinder(binder.id), binder.color,
        alreadyInDrive + index, cleanCover(binder.cover), binderPages(binder.id));
      forgetBinder(binder.id);
    }
  } catch (err) {
    setLocalMode(true);
    throw new Error(`Couldn't upload all your binders to Google Drive. ${err.message}`);
  }
}
