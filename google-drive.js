/* =========================================================================
   GOOGLE SIGN-IN AND GOOGLE DRIVE
   Shared by index.html (the landing page), binder.html (a binder) and
   cardsearch.html (the card search: who's logged in, and Sign out).

   How it works:
   - "Sign in with Google" uses Google's own sign-in library (loaded from
     accounts.google.com in each page's HTML). Google shows its own window
     where the person picks an account and agrees to let this app use Drive.
   - Google hands back an "access token": a temporary pass (it lasts about
     an hour) that lets this page talk to that person's Google Drive.
   - We only ask for the "drive.file" permission: this app can see and
     change ONLY the files it created itself, nothing else in their Drive.
   - Each binder is one .json file inside a folder called "MTG Card Binder"
     in their Drive. The file's Drive id is also the binder's id.
   - The access token is kept in "sessionStorage", which is wiped when the
     browser tab closes, so the pass doesn't stay on the computer.
   ========================================================================= */

// The app's Google Client ID. It tells Google which app is asking to sign
// in, and comes from Google Cloud Console (see the README for the steps).
// To use a different Google Cloud project, replace the text between the
// quotes with that project's Client ID.
// (A client ID is not a secret: it's fine for it to be in public code.)
const GOOGLE_CLIENT_ID = '595038767611-a97c7o5tcg348tis5pcbul562n1k0tnl.apps.googleusercontent.com';

// The permission we ask for: only files this app creates (see above).
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

// The folder the binders live in, inside the person's Google Drive.
const DRIVE_FOLDER_NAME = 'MTG Card Binder';

// Where the access token and the folder's id are kept (sessionStorage).
const TOKEN_KEY = 'googleToken';
const FOLDER_KEY = 'driveFolderId';

// Google Drive's web addresses for its API (the way programs talk to it).
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';

// Has the client ID above been filled in yet?
function googleIsConfigured() {
  return !GOOGLE_CLIENT_ID.startsWith('PASTE-');
}

// The current access token, or null if there isn't one or it's about to
// run out (within a minute), in which case the person must sign in again.
function getAccessToken() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(TOKEN_KEY));
    if (saved && saved.expiresAt > Date.now() + 60 * 1000) return saved.accessToken;
  } catch (e) { /* nothing saved, or storage blocked */ }
  return null;
}

// Are we connected to Google Drive right now?
function isSignedIn() {
  return getAccessToken() !== null;
}

// Forget the access token (it expired, or the person signed out).
function forgetAccessToken() {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(FOLDER_KEY);
  } catch (e) { /* storage blocked: nothing to forget */ }
}

// An error meaning "not signed in (or the sign-in ran out)". Pages check
// for err.signedOut to show the sign-in button again.
function signedOutError() {
  const err = new Error('Your Google sign-in has expired. Please sign in again.');
  err.signedOut = true;
  return err;
}

/* ---------------------------------------------------------------------
   SIGNING IN AND OUT
   --------------------------------------------------------------------- */

// Google's sign-in helper, made once the library has loaded.
let tokenClient = null;

// The sign-in in progress, so Google's answer can finish it.
let pendingSignIn = null;

// Wait for Google's sign-in library to finish loading (it loads separately,
// from Google's own website). Gives up after 10 seconds.
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

// Get Google's sign-in helper ready. Pages call this as soon as they open,
// so that clicking "Sign in" can open Google's window straight away
// (browsers only allow pop-up windows right after a click).
async function initGoogleSignIn() {
  if (!googleIsConfigured()) return;
  await whenGoogleLibraryReady();
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: DRIVE_SCOPE,
    // Google's answer when the person finishes in the sign-in window.
    callback: (response) => {
      const done = pendingSignIn;
      pendingSignIn = null;
      if (!done) return;
      if (response.error) {
        done.reject(new Error('Google sign-in didn\'t finish. Please try again.'));
        return;
      }
      // Keep the pass, and when it runs out (Google says how many seconds).
      try {
        sessionStorage.setItem(TOKEN_KEY, JSON.stringify({
          accessToken: response.access_token,
          expiresAt: Date.now() + Number(response.expires_in) * 1000
        }));
      } catch (e) { /* storage blocked: it still works until the page closes */ }
      done.resolve(response.access_token);
    },
    // The sign-in window was closed, or couldn't open (pop-up blocked).
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

// Open Google's sign-in window. Call this straight from a button click.
// Resolves when signed in; rejects with a message if not.
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

// Sign out: tell Google to cancel the pass, then forget it here.
function signOutOfGoogle() {
  const token = getAccessToken();
  if (token && window.google && google.accounts && google.accounts.oauth2) {
    google.accounts.oauth2.revoke(token, () => {});
  }
  forgetAccessToken();
}

// The full "Sign out" (the link at the bottom right of every page):
//  1. save any binder changes that haven't reached Google Drive yet
//     (if that fails, ask before throwing those changes away)
//  2. sign out of Google
//  3. forget the binders kept in this browser, so the next person on this
//     computer doesn't see them
// Returns true if signed out, false if the person chose to stay signed in.
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
  clearAllBinders();   // binder-storage.js
  return true;
}

// Is someone using the app as a signed-in user? True when signed in to
// Google in this tab, OR when their binders are still kept in this browser
// (the Google pass may have run out, but they haven't signed out: Sign out
// is what clears the binders). Pages use this to show or hide everything
// to do with binders: the "My Binders" link, "Add to binder", "Sign out".
function isLoggedIn() {
  return isSignedIn() || loadBinderList().length > 0;
}

// Set up the "Sign out" link in the page's footer. It only shows when
// someone is logged in (see isLoggedIn).
// "afterSignOut" is what the page does once signed out.
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

/* ---------------------------------------------------------------------
   TALKING TO GOOGLE DRIVE
   --------------------------------------------------------------------- */

// Send a request to Google Drive with the access token attached.
// Throws a "signed out" error if the token is missing or Google rejects it,
// and a normal error (with Google's message) for any other problem.
async function driveRequest(url, options = {}) {
  const token = getAccessToken();
  if (!token) throw signedOutError();

  const response = await fetch(url, {
    ...options,
    headers: { ...(options.headers || {}), Authorization: `Bearer ${token}` }
  });
  if (response.status === 401) {           // 401 = "not allowed": the pass ran out
    forgetAccessToken();
    throw signedOutError();
  }
  if (!response.ok) {
    let message = `Google Drive error (${response.status}).`;
    try {
      const body = await response.json();
      if (body.error && body.error.message) message = `Google Drive: ${body.error.message}`;
    } catch (e) { /* the error had no readable details */ }
    throw new Error(message);
  }
  return response;
}

// Who is signed in: { displayName, emailAddress }.
async function getDriveUser() {
  const response = await driveRequest(`${DRIVE_API}/about?fields=user(displayName,emailAddress)`);
  return (await response.json()).user;
}

// Find the "MTG Card Binder" folder in their Drive, or make it if it's not
// there yet. Its id is remembered for this tab so we only look once.
async function getBinderFolderId() {
  try {
    const remembered = sessionStorage.getItem(FOLDER_KEY);
    if (remembered) return remembered;
  } catch (e) { /* storage blocked: just look it up */ }

  // Drive's search language: a folder with this exact name, not in the trash.
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

  try { sessionStorage.setItem(FOLDER_KEY, folderId); } catch (e) { /* fine */ }
  return folderId;
}

// List the binder files in the folder, oldest first:
// [{ id, name, appProperties }, ...]. "name" is the file name, e.g.
// "Binder 1.json". "appProperties" are small labels this app stores on the
// file itself, like { color: "U", pages: "10", order: "2" } (see
// createBinderFile and updateBinderDetails).
// Drive hands lists back in batches (up to 1000 files each) with a
// "nextPageToken" when there are more, so keep asking until there's none:
// there's no limit on how many binders someone can have.
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

// Read one binder file's contents (the binder data).
async function readBinderFile(fileId) {
  const response = await driveRequest(`${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media`);
  return response.json();
}

// Replace one binder file's contents with new binder data.
async function writeBinderFile(fileId, data) {
  await driveRequest(`${DRIVE_UPLOAD_API}/files/${encodeURIComponent(fileId)}?uploadType=media`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data, null, 2)
  });
}

// Make a new binder file in the folder, holding these cards (often none).
// Returns { id, name }.
// "color" is the cover's symbol code from MANA_COLORS (e.g. "U", "PW" or
// "WU") or null for none, and "order" is its spot on the shelf (0 = first).
// Both are stored as labels on the file's details, so the shelf can show
// them without opening every binder. New binders have DEFAULT_PAGES pages.
// A new file needs two things sent together: its details (name, folder)
// and its contents. Drive takes both in one "multipart" message: two parts
// separated by a "boundary" line that appears nowhere else.
async function createBinderFile(name, cards = {}, color = null, order = null) {
  const folderId = await getBinderFolderId();
  const boundary = `binder-${Date.now()}`;
  // The file's contents: the same layout binderFileData (binder-storage.js) writes.
  const data = { app: FILE_APP_NAME, version: 1, name, color, pages: DEFAULT_PAGES, cards };
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
    `${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id,name`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body
    });
  return response.json();
}

// Change a binder file's details: its name, cover color, number of pages
// and/or its place in the shelf's order. Only the details passed in change:
//   { name: "Modern Decks" }      renames it (the file becomes "Modern Decks.json")
//   { color: "R" } / { color: null } sets or removes the cover symbol
//   { pages: 20 }                 how many pages the binder has
//   { order: 3 }                  its spot on the shelf (0 = first)
// The color, pages and order are small labels ("appProperties") on the file.
async function updateBinderDetails(fileId, { name, color, pages, order } = {}) {
  const details = {};
  const labels = {};
  if (name !== undefined) details.name = `${name}.json`;
  if (color !== undefined) labels.color = color;            // null removes the label
  if (pages !== undefined) labels.pages = String(pages);    // labels are always text
  if (order !== undefined) labels.order = String(order);
  if (Object.keys(labels).length) details.appProperties = labels;
  await driveRequest(`${DRIVE_API}/files/${encodeURIComponent(fileId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(details)
  });
}

// "Delete" a binder: move its file to the Google Drive trash (not gone for
// good: it can still be restored from the trash in Google Drive for 30 days).
async function trashBinderFile(fileId) {
  await driveRequest(`${DRIVE_API}/files/${encodeURIComponent(fileId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trashed: true })
  });
}

// The binder's display name from its file name ("Binder 1.json" → "Binder 1").
function nameFromFileName(fileName) {
  return fileName.replace(/\.json$/i, '');
}

// Bring one binder up to date between this browser and Google Drive:
//  - if this browser has changes Drive doesn't have yet, SEND them to Drive
//  - otherwise, FETCH the binder from Drive (it may have been changed on
//    another computer) and keep it as this browser's working copy
// Returns the binder's cards as they now stand.
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
