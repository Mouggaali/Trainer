# Game design — FireRed-stijl & monster-XP

Doel: training leuker maken én hypertrofie-gedrag belonen (harde werksets, progressie, consistentie).
Stijl: Pokémon FireRed (GBA), maar met **eigen originele monsters** (geen Nintendo-assets: de site is publiek).

## Team (één monster per spiergroep, evolueert op Lv16 en Lv36)
| Spiergroep | Type | Vorm 1 → 2 → 3 |
|---|---|---|
| Borst | Vuur | Pecling → Pectorch → Pectoblaze |
| Rug | Vliegend | Latlet → Latwing → Lataquil |
| Schouders | Steen | Deltoad → Deltorock → Deltitan |
| Armen | Vecht | Curlip → Curlash → Bicepion |
| Benen | Gras | Quadbud → Quadroot → Quadorak |
| Core | Elektrisch | Coreon → Corezap → Corestorm |

Sprites: 24×24 pixel-grids → SVG in `js/game/monsters.js`. Bijnamen: `profile.monsterNames[muscle]`.

## XP-regels (`js/game/xp.js`)
XP wordt **afgeleid uit de trainingsgeschiedenis**, nooit opgeslagen. Oude trainingen tellen mee;
verwijderen van een training verlaagt XP. Geen migratie of sync-conflicten.

| Gebeurtenis | XP | Naar |
|---|---|---|
| Afgevinkte werkset (geen warming-up) | 10 | hoofdspiergroep (+5 naar `secondary`) |
| Oefening gehaald (`sessionHit`: alle sets + reps) | 15 | hoofdspiergroep |
| Training afgerond | 25 | verdeeld naar rato van sets |
| Persoonlijk record (e1RM, `w.prs`) | 50 | spiergroep van de oefening |
| Weekdoel gehaald (training die `weeklyGoal` bereikt) | 50 | hele team |

- **Weekcap**: max **20 werksets per spiergroep per week** geven set-XP (bovengrens hypertrofie 10–20).
- Weekdoel-bonus is bewust 50 (niet 100): anders levelen nooit getrainde spiergroepen te hard mee en zie je
  niet meer welke spiergroep achterblijft.
- `secondary` staat in `js/exercise-library.js` (`SECONDARY`-map) voor basisoefeningen; eigen oefeningen
  kiezen hem in het oefening-formulier.

## Levelcurve
Totale XP voor level L = `6 × L²` (Lv1 = 0, max Lv100). Simulatie 3×/week bench + squat machine:
na 8 weken Borst/Benen ±Lv18, niet-getrainde groepen ±Lv8. Lv36 ≈ 6–7 maanden, Lv50 ≈ 1 jaar.

## UI
- Team-tab (Profiel): trainerkaart + party-scherm; `#/monster/:muscle` detail met hypertrofie-meter
  (sets deze week / 20), evolutielijn, XP-regels, bijnaam.
- Training: `+10 EXP.`-popup bij elke werkset (`xpPop`), "MAX deze week" boven de cap.
- Na afronden: `dialogSequence` (FireRed-tekstvak): EXP per monster met animerende balk → level-up →
  evolutie → daarna de bestaande samenvatting. "Overslaan" slaat de reeks over.
- Geluid (`sfx` in `js/ui.js`, eigen chiptune, respecteert `settings.sound`).
- Rustbalk toont de volgende set (oefening · kg × reps · set x van y); scherm blijft aan tijdens een training
  (Wake Lock, `settings.keepAwake`). Live Activities kunnen niet vanuit een web-app; wel een pushmelding op het vergrendelscherm
  zodra de rust voorbij is (met de volgende set), zie DATABASE_SETUP.md.
- Einde-rust-geluid (`js/sound.js`): 6 eigen geluiden (Bel, Ping, Chiptune, Level-up, Alarm, Gong), kiesbaar met
  volume in Instellingen. Gespeeld via een `<audio>`-element met `navigator.audioSession.type = 'playback'`:
  hoorbaar bij stilteschakelaar en door oortjes. Volume zit in de samples (iOS negeert `audio.volume`);
  `unlockSound()` draait bij elke set-tik (iOS wil een tik voor het eerste afspelen). Een playback-geluid kan
  muziek van andere apps pauzeren. Bij een vergrendeld scherm bevriest iOS de app: dan geldt de pushmelding.
