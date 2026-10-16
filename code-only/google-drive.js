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

async function initGoogleSignIn() {
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
  return isSignedIn() || loadBinderList().length > 0;
}

function setUpFooterSignOut(afterSignOut) {
  const link = document.getElementById('footerSignOut');
  if (!link) return;
  link.hidden = !isLoggedIn();
  link.addEventListener('click', async () => {
    link.disabled = true;
    link.textContent = 'Signing out…';
    const signedOut = await signOutAndForget();
    link.disabled = false;
    link.textContent = 'Sign out';
    if (signedOut) afterSignOut();
  });
}

async function driveRequest(url, options = {}) {
  const token = getAccessToken();
  if (!token) throw signedOutError();

  const response = await fetch(url, {
    ...options,
    headers: { ...(options.headers || {}), Authorization: `Bearer ${token}` }
  });
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
  const response = await driveRequest(
    `${DRIVE_API}/files?q=${encodeURIComponent(query)}` +
    `&fields=files(id,name,createdTime,appProperties)&orderBy=createdTime&pageSize=100`);
  return (await response.json()).files;
}

async function readBinderFile(fileId) {
  const response = await driveRequest(`${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media`);
  return response.json();
}

async function writeBinderFile(fileId, data) {
  await driveRequest(`${DRIVE_UPLOAD_API}/files/${encodeURIComponent(fileId)}?uploadType=media`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data, null, 2)
  });
}

async function createBinderFile(name, data, color = null, order = null) {
  const folderId = await getBinderFolderId();
  const boundary = `binder-${Date.now()}`;
  const details = { name: `${name}.json`, mimeType: 'application/json', parents: [folderId] };
  const labels = {};
  if (color) labels.color = color;
  if (order !== null) labels.order = String(order);
  if (Object.keys(labels).length) details.appProperties = labels;
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(details)}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n` +
    `${JSON.stringify(data, null, 2)}\r\n` +
    `--${boundary}--`;
  const response = await driveRequest(
    `${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id,name,createdTime`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body
    });
  return response.json();
}

async function updateBinderDetails(fileId, { name, color, pages, order } = {}) {
  const details = {};
  const labels = {};
  if (name !== undefined) details.name = `${name}.json`;
  if (color !== undefined) labels.color = color;
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
