# Datamodel

Alles staat in één JSON-object in `localStorage["trainer.v1"]`, beheerd door `js/store.js`.
Tijdstippen zijn epoch-milliseconden; datums van metingen zijn `YYYY-MM-DD`.

```jsonc
{
  "version": 1,
  "profile":  { "name": "" },
  "settings": { "weeklyGoal": 3, "defaultRest": 120, "autoApply": true, "sound": true },

  "customExercises":   [ { "id", "name", "equipment", "muscle", "lower", "increment"?, "custom": true } ],
  "exerciseOverrides": { "<libraryId>": { "name"?, "equipment"?, "muscle"?, "lower"?, "increment"?, "secondary"? } },
  "exerciseNotes":     { "<exerciseId>": "Stoel stand 4, ..." },

  "templates": [{
    "id", "name", "updatedAt",
    "exercises": [{ "exerciseId", "restSec",
                    "sets": [{ "kg": number|null, "reps": number|null, "warmup"?: true }] }]
  }],

  "workouts": [{                       // afgeronde trainingen
    "id", "templateId"|null, "name", "startedAt", "finishedAt",
    "prs": ["<exerciseId>"],           // oefeningen met nieuw e1RM-record
    "exercises": [{ "uid", "exerciseId", "restSec", "targetSets",
                    "sets": [{ "id", "kg", "reps", "done", "warmup",
                               "target": { "kg", "reps" } }] }]
  }],

  "active": null | { ...zelfde vorm als workout zonder finishedAt,
                     "rest": { "endsAt", "total" } | null,
                     "exercises[].rec": <advies-object> },

  "bodyweight":   [{ "id", "date": "YYYY-MM-DD", "kg" }],
  "measurements": [{ "id", "date": "YYYY-MM-DD",
                     "values": { "biceps_L": 36.5, "biceps_R": 37, "waist": 82, ... } }]
}
```

## Andere localStorage-keys
- `trainer.auth` — Supabase-sessie (supabase-js `storageKey`); aanwezig = ingelogd, app open.
- `trainer.sync` — sync-meta (`linkedUser`, `lastSyncedAt`, `dirty`, `lastBackupDay`).

## Meetpunten (`MEASURE_PARTS` in `js/views/body.js`)
Enkel: `neck`, `shoulders`, `chest`, `waist`, `hips`, `bodyfat` (%).
Links/rechts (`_L` / `_R`): `biceps`, `forearm`, `thigh`, `calf`.

## Oefeningen
Standaardbibliotheek in `js/exercise-library.js` (id = slug van de naam, bv. `bench-press-barbell`).
Effectieve oefening = bibliotheek + `exerciseOverrides` + `customExercises` (`allExercises()`).

## Migraties
Verhoog `version` en voeg een stap toe in `migrate()` in `store.js`. Oude data moet altijd blijven werken.

## Relationeel equivalent
Zie `supabase/schema.sql` voor de tabellen die bij cloud-sync worden gebruikt.

## Optionele velden (geen migratie nodig)
- `templates[].exercises[].repRange` en `workouts[].exercises[].repRange`: `{ "min": 8, "max": 12 }` → double progression.
- `workouts[].exercises[].sets[].rir`: 0–3 (3 = "3+"), reps in reserve.
- `settings.askRir` (bool), `settings.restSound`, `settings.soundVolume`.

## Voeding (optionele velden via `defaults()`, geen migratie nodig)
- `foods`: `[{ id, name, brand?, barcode?, per100: { kcal, protein, carbs, fat }, serving?: { label, g }, unit?: 'g'|'ml', source: 'off'|'custom', usedAt, lastGrams }]`
  — `unit: 'ml'` = drinken: waarden per 100 ml, `grams`/`serving.g` zijn dan ml (Open Food Facts: `product_quantity_unit`).
  — onthouden producten (Recent / Mijn producten), ook offline.
- `foodLog`: `[{ id, date: 'YYYY-MM-DD', meal: 'ontbijt'|'lunch'|'diner'|'snack', foodId, name, grams, unit?, kcal, protein, carbs, fat }]`
  — voedingswaarden als momentopname.
- `profile.body`: `{ sex: 'm'|'f', birthYear, heightCm, activity: 'low'|'mid'|'high' }` (of `null`).
- `settings.nutrition`: `{ goal: 'bulk'|'maintain'|'cut', proteinPerKg, tdee, kcalOverride, adjustedAt, history: [{ at, tdee, kcal }] }`.
