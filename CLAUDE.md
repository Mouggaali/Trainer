# Trainer — persoonlijke krachttrainings-app

Mobiele web-app (PWA) om trainingen bij te houden en spiermassa op te bouwen. Geïnspireerd op
[Strong](https://www.strong.app/), maar persoonlijker en slimmer: de app doet gewichtsadvies per set
voor de volgende sessie. Claude fungeert in dit project ook als **persoonlijke trainer** van de gebruiker.

## Rol van Claude
- Bouw en onderhoud de app (code, design, data).
- Denk mee als trainer gericht op **hypertrofie** (spiermassa): progressieve overbelasting, voldoende
  volume, realistische gewichtsstappen. Zie [docs/TRAINING_PRINCIPLES.md](docs/TRAINING_PRINCIPLES.md).
- Communiceer in het **Nederlands**. UI-teksten zijn Nederlands; oefeningnamen blijven Engels
  (zoals in Strong, bv. "Bench Press (Barbell)").

## Context-documenten (lees deze eerst bij nieuw werk)
| Bestand | Inhoud |
|---|---|
| [docs/PRODUCT.md](docs/PRODUCT.md) | Wensen van de gebruiker, features, schermen, wat er al af is |
| [docs/TRAINING_PRINCIPLES.md](docs/TRAINING_PRINCIPLES.md) | Trainersfilosofie + exacte regels van het gewichtsadvies |
| [docs/DATA_MODEL.md](docs/DATA_MODEL.md) | Vorm van alle opgeslagen data (localStorage-schema) |
| [docs/DATABASE_SETUP.md](docs/DATABASE_SETUP.md) | Stappenplan voor cloud-database (Supabase) + hosting voor de telefoon |
| [docs/USER_PROFILE.md](docs/USER_PROFILE.md) | Wat we weten over de gebruiker en zijn huidige schema |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Volgende stappen en ideeën |
| [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md) | FireRed-stijl, monsters per spiergroep, XP-regels en levelcurve |

## Tech stack
- **Geen build-stap**: vanilla JavaScript (ES modules), HTML, CSS. Openen = draaien.
- **Opslag**: `localStorage` (key `trainer.v1`) via `js/store.js`, gespiegeld naar Supabase
  (`public.app_state`, één JSON-rij per gebruiker) door `js/sync.js`. supabase-js komt via jsDelivr CDN.
- **Secrets**: de gebruiker wil **geen keys in de GitHub-repo**. `.env` en `js/config.js` zijn gitignored;
  `tools/build-config.js` maakt `js/config.js` uit `.env` (lokaal) of uit repo secrets (GitHub Actions).
- **Login verplicht**: `gateState()` (`js/sync.js`) bepaalt in `render()` of de app of het inlogscherm
  (`js/views/login.js`) getoond wordt; opgeslagen sessie = app open (ook offline). Uitloggen wist lokale data.
- **Pushmeldingen** (einde rust): `js/push.js` schrijft `rest_timers`; pg_cron + Edge Function
  `supabase/functions/send-rest-push` versturen Web Push; `sw.js` toont hem. Setup: DATABASE_SETUP.md.
  Geheimen (`supabase/functions/.env`, `supabase/*.local.sql`) zijn gitignored.
- **Hosting**: GitHub Pages via `.github/workflows/deploy.yml` → https://mouggaali.github.io/Trainer/
- **Layout**: de pagina scrolt zelf nooit; `#view` is de scroller en de werk-/rustbalk + tabbalk zijn flex-kinderen
  eronder (`position: fixed` balken driften op iOS los van de scrollende pagina). Nieuwe overlays mogen wel fixed.
- **PWA**: `manifest.webmanifest` + `sw.js` (network-first) → installeerbaar op het beginscherm.
- **Charts**: eigen kleine SVG-charts in `js/charts.js` (geen libraries).
- **Dev-server**: `node server.js` → http://localhost:5173 (ook bereikbaar via LAN-IP voor de telefoon).

## Structuur
```
index.html            app-shell (view, tabbar, rest-timer, sheet, toast)
css/styles.css        alle styling (dark theme, mobile-first)
js/app.js             router (hash), event-delegatie, ticker (rusttimer/klok), tabbar
js/store.js           state, opslag, seed-data, queries (exerciseSessions, allExercises, ...)
js/sync.js            Supabase login (e-mail + wachtwoord) + push/pull van de state
js/sound.js           einde-rust-geluiden (zelf gesynthetiseerd, WAV via <audio>, iOS audioSession 'playback')
js/push.js            Web Push: abonnement + rest_timers plannen/verplaatsen/annuleren
js/config.js          GEGENEREERD, gitignored (Supabase URL + publishable key)
js/progression.js     gewichtsadvies-algoritme + e1RM
js/stats.js           weekstatistieken, volume, streaks, records
js/charts.js          barChart / lineChart (SVG)
js/ui.js              helpers: escape, formatters, iconen, sheets (bottom sheets), toast, actions-registry
js/exercise-library.js standaard oefeningen (naam, equipment, spiergroep, lower-body flag)
js/game/xp.js         monster-XP (afgeleid uit historie), levels, evoluties
js/game/monsters.js   18 originele pixel-monsters (24×24 grids → SVG)
js/views/*.js         schermen: home(templates), active (training), history, profile (+team), team, body, exercises
server.js             statische dev-server zonder dependencies
sw.js                 service worker
```

## Conventies
- Views exporteren `render...()` die een HTML-string teruggeven, optioneel `mount...()` voor listeners.
- Interactie via **event-delegatie**: `data-action="naam"` (click) en `data-input="naam"` (change;
  met `data-live` ook bij elke toetsaanslag). Handlers registreren met `on({ naam: (el, e) => ... })`.
- State wijzigen alleen via `update(fn, { silent })`. Niet-silent → hele view her-rendert.
  Gebruik `silent: true` voor tekstinvoer zodat focus behouden blijft.
- Escape altijd gebruikersinvoer met `esc()` in templates.
- Gewichten in kg, getallen met punt (21.25). Invoer accepteert ook komma.
- Mobiel eerst: touch targets ≥ 44px, `inputmode` op numerieke velden, safe-area insets.
- Stijl = Pokémon FireRed (GBA): pixelfonts, witte panelen met pixelrand, geen officiële Pokémon-assets of
  -namen (de site is publiek). XP nooit opslaan, altijd afleiden (`js/game/xp.js`).

## Draaien
```bash
node tools/build-config.js   # eenmalig / na wijzigen van .env
node server.js
```
Open http://localhost:5173. Op de telefoon (zelfde wifi): het LAN-adres dat de server print.

## Belangrijk
- Bestaande gebruikersdata nooit breken: bij schemawijzigingen `version` ophogen en een migratie in
  `store.js` → `migrate()` toevoegen.
- Data staat lokaal (offline-first) én in Supabase. Export/import (Instellingen) is een extra back-up.
