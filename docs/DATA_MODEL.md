# Datamodel

Alles staat in één JSON-object in `localStorage["trainer.v1"]`, beheerd door `js/store.js`.
Tijdstippen zijn epoch-milliseconden; datums van metingen zijn `YYYY-MM-DD`.

```jsonc
{
  "version": 1,
  "profile":  { "name": "" },
  "settings": { "weeklyGoal": 3, "defaultRest": 120, "autoApply": true, "sound": true },

  "customExercises":   [ { "id", "name", "equipment", "muscle", "lower", "increment"?, "custom": true } ],
  "exerciseOverrides": { "<libraryId>": { "name"?, "equipment"?, "muscle"?, "lower"?, "increment"? } },

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
