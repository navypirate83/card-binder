# Card Binder

A Magic: The Gathering card binder. Sign in with Google, make as many binders as you like, fill their pockets with cards found in the card search, and flip through the pages. Each binder is saved in your own Google Drive.

**Live app:** https://navypirate83.github.io/card-binder/

## Pages
- **My Binders (`index.html`)** – the landing page. Sign in with Google, then pick a binder from the shelf, or click the "+" binder to make a new one. Drag a binder to reorder it, onto the pencil to rename it, change its symbol or its number of pages (1–150), or onto the red X to delete it.
- **Binder (`binder.html`)** – one binder. Turn pages, drag cards between pockets (hold at an edge to turn the page, drop on the red X to remove), download/upload a `.json` backup.
- **Card Search (`cardsearch.html`)** – search any Magic card and view every printing:
  - Fuzzy search with live suggestions after 3 letters (ignores punctuation and forgives typos)
  - Set picker showing `set symbol | CODE | Set Name`, plus Version and Language pickers
  - Flip button for double-sided cards, Notes and Rules, a Share button, and Add to binder
- Light/dark mode switch and mobile-friendly layout on every page.

## Files
| Page | HTML | Styles | Code |
|---|---|---|---|
| My Binders (landing) | `index.html` | `landing.css` | `landing.js` |
| Binder | `binder.html` | `style.css` | `javascript.js` |
| Card Search | `cardsearch.html` | `cardsearch.css` | `cardsearch.js` |

Shared code:
- `binder-storage.js` – each binder's working copy in the browser, and the "needs saving to Drive" marker.
- `google-drive.js` – Google sign-in and reading/writing binder files in Google Drive.

## Google Drive storage
Signing in asks only for the `drive.file` permission: the app can see and change **only the files it creates**, nothing else in your Drive. Binders are saved as `.json` files in a **MTG Card Binder** folder in your Drive.

### One-time setup: the Google Client ID
Google sign-in needs a Client ID (it tells Google which app is asking; it is not a secret).

1. Go to https://console.cloud.google.com/ and create a project (e.g. "MTG Card Binder").
2. **APIs & Services → Library** → search **Google Drive API** → **Enable**.
3. **APIs & Services → OAuth consent screen** (Google Auth Platform) → fill in the app name and your email. Audience: **External**. While the app is in "Testing", add the Google accounts allowed to sign in under **Test users**.
4. **Data Access** (scopes) → add `https://www.googleapis.com/auth/drive.file`.
5. **Clients** (Credentials) → **Create client** → type **Web application**. Under **Authorized JavaScript origins** add:
   - `https://navypirate83.github.io`
   - `http://localhost:3000`
6. Copy the Client ID (it ends in `.apps.googleusercontent.com`) and paste it into `GOOGLE_CLIENT_ID` at the top of `google-drive.js`.

## Running it locally
From this folder: `python -m http.server 3000`, then open http://localhost:3000

Built with plain HTML, CSS and JavaScript — no frameworks.
Card data and images come from the [Scryfall API](https://scryfall.com/docs/api).
