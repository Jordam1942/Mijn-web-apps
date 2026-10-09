# Mijn-web-apps

Mijn webapps, elk in een eigen map.

| App | Map | Wat is het |
|---|---|---|
| Toepen | [`toepen/`](toepen/) | Kaartspel: alleen spelen, multiplayer (PeerJS en QR-ring) en een scorebord. Werkt als app op je telefoon (PWA). |
| Royal Flush Society | [`poker/`](poker/) | Texas Hold'em met speelgeld (18+): tegen de computer, met vrienden op afstand of in dezelfde kamer, en een fichetelling. Werkt als app op je telefoon (PWA). |

## Toepen op GitHub Pages

Zet in de instellingen van deze repository onder **Pages** de bron op de branch `main` (map `/ (root)`). De app staat dan op `https://jordam1942.github.io/Mijn-web-apps/toepen/`.

## Mijn spellen (menu-app)

De startpagina `index.html` is een menu waarin je Royal Flush Society of Toepen kiest. Installeer deze ene app op je telefoon om beide spellen te openen.

## Royal Flush Society op GitHub Pages

De app staat op `https://jordam1942.github.io/Mijn-web-apps/poker/`.

## Royal Flush Society testen

- `node poker/tests/engine.test.js`: spelregels, handen en potten.
- `node poker/tests/table.test.js`: tafel met computerspelers, opslaan en hervatten, blinds.
- `node poker/tests/online.test.js`: vrienden aan één tafel, met een nep-database.
- `node poker/tests/ui.test.js`: browsertests met Playwright (412 × 800 en 412 × 860, acht spelers).

## Toepen testen

`node toepen/tests/engine.test.js` speelt duizenden willekeurige potjes en controleert de spelregels.

Laatste update: Pages ingeschakeld.
