# Card Binder

A Magic: The Gathering card binder. Fill the pockets with cards found in the card search, and flip through the pages.

**Live app:** https://navypirate83.github.io/card-binder/

The home page is `index.html`.

## Card Search (`cardsearch.html`)
Search any Magic: The Gathering card and view its image from every set and version it was printed in.

- Fuzzy search with live suggestions after 3 letters (ignores punctuation and forgives typos)
- Set picker showing `set symbol | CODE | Set Name`, plus a Version picker for each printing
- Flip button for double-sided cards
- Notes and Rules section listing the card's official rulings
- Share button that links straight to the exact set, version and side shown
- Light/dark mode switch, mobile-friendly layout

## Files
| Page | HTML | Styles | Code |
|---|---|---|---|
| Card Binder | `index.html` | `style.css` | `javascript.js` |
| Card Search | `cardsearch.html` | `cardsearch.css` | `cardsearch.js` |

`binder-storage.js` is shared by both pages: it saves and loads the cards in the binder.

Built with plain HTML, CSS and JavaScript — no frameworks.
Card data and images come from the [Scryfall API](https://scryfall.com/docs/api).
