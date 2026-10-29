# Trainingsprincipes & gewichtsadvies

Doel van de gebruiker: **spiermassa opbouwen (hypertrofie)**.

## Trainersfilosofie
- **Progressieve overbelasting**: elke sessie iets meer (gewicht of reps), maar realistisch.
- **Rep-bereik**: hoofdoefeningen 6–10 reps, isolatie 10–15 reps. Sets tot ~1–2 reps voor falen (RIR 1–2).
- **Volume**: ~10–20 harde sets per spiergroep per week, verdeeld over 2× per week per spiergroep.
- **Rust**: compound 2–3 min, isolatie 1–1.5 min.
- **Techniek boven gewicht**: liever gewicht vasthouden dan reps "vals" halen.
- **Deload** als progressie meerdere sessies stokt.

## Algoritme (`js/progression.js` → `recommend(ex, sessions, planned)`)
Input: de oefening, eerdere sessies (nieuwste eerst) en de geplande sets uit het template.
Alleen **afgevinkte werksets** tellen (warming-up sets niet).

1. **Geen historie** → `new`: template-waarden; advies "kies een gewicht met RIR 1–2".
2. **Gehaald** = alle geplande werksets gedaan én elke set ≥ doel-reps.
   - Met gewicht → `increase`: +stap per set (piramide blijft behouden).
   - ≥ 3 reps over op álle sets → dubbele stap.
   - Lichaamsgewicht (geen kg) → +1 rep per set; boven 15 reps: tip om gewicht toe te voegen.
3. **Niet gehaald** → `hold`: zelfde gewicht, doel is alle reps halen.
4. **3× achter elkaar niet gehaald op hetzelfde topgewicht** → `deload`: −10% (afgerond), opnieuw opbouwen.

### Stapgrootte (`incrementFor`)
| Equipment | Bovenlichaam | Onderlichaam (`lower: true`) | Afronding |
|---|---|---|---|
| Barbell / Smith | 2.5 kg | 5 kg | 1.25 |
| Machine | 2.5 kg | 5 kg | 1.25 |
| Kabel | 2.5 kg | 2.5 kg | 1.25 |
| Dumbbell | 2 kg | 2 kg | 1 |
| Kettlebell | 4 kg | 4 kg | 2 |

- Behalve bij dumbbells/kettlebells is de stap **gemaximeerd op ~10% van het topgewicht**
  (bv. machine squat 21.25 kg → +1.25 i.p.v. +5).
- Per oefening kan een **eigen stap** worden ingesteld (Oefeningen → bewerken), die gaat altijd voor.

### Doel-reps
- Komen uit het template (`sets[i].reps`). Bij starten wordt per set `target: {kg, reps}` opgeslagen;
  de volgende sessie wordt hiertegen beoordeeld.
- Instelling **"Advies automatisch invullen"** (standaard aan) vult kg/reps met het advies.

## e1RM
Epley: `kg × (1 + reps / 30)` (1 rep = kg). Gebruikt voor progressiecharts en PR-detectie.

## Ideeën om later toe te voegen
- Volume per spiergroep per week met waarschuwing bij te weinig/te veel.

## Rep-bereik (double progression) — `recommendRange()`
Per template-oefening optioneel `repRange: { min, max }` (bv. 8–12). Beoordeling op de vorige sessie:
1. Alle geplande werksets ≥ `max` reps → gewicht +stap (`incrementFor`), doel terug naar `min` reps.
2. Een set onder `min` (of sets gemist) → zelfde gewicht, doel `min`; 3× op rij op hetzelfde gewicht → deload −10%.
3. Anders → zelfde gewicht, per set laatste reps +1 (gemiddelde RIR ≥ 3 → +2), afgekapt op `max`.
Lichaamsgewicht-oefeningen: bovenkant bereikt → tip om gewicht toe te voegen.

## RIR (reps in reserve)
Na het afvinken van een werkset vraagt de app "Reps over? 0 · 1 · 2 · 3+" (optioneel, `settings.askRir`).
- Vaste reps, gehaald met gemiddelde RIR ≥ 3 → dubbele stap; gehaald met RIR 0 → enkele stap + hersteltip.
- Dubbele stappen nooit groter dan 15% van het gewicht (`bigStep`), zodat lichte kabel/dumbbell-gewichten
  niet met 30–40% omhoog springen.
- Geen RIR ingevuld → regels zoals hierboven zonder RIR.
