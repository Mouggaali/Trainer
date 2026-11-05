# Product — wat de gebruiker wil

Bron: eerste briefing van de gebruiker (24 okt 2026) + 4 screenshots van Strong (Profile/Dashboard,
Start Workout/Templates, template-preview "Maandag", actieve training).

## Kernwensen
1. **Templates** voor de trainingen van de week (bv. Maandag / Woensdag / Vrijdag).
2. Per template **oefeningen**; per oefening: aantal **sets**, **kg per set**, **reps per set**, en
   zichtbaar **wat er de vorige sessie is gedaan**.
3. **Training starten** vanuit een template; elke set afvinken met een **groen vinkje**.
4. **Rusttimer** tussen sets, instelbaar per oefening.
5. **Gewichtsadvies**: op basis van de vorige sessie een realistisch gewicht voor de volgende keer
   (bv. bench 4×50 kg gehaald → 52.5 kg). Zie TRAINING_PRINCIPLES.md.
6. **Profiel**: aantal trainingen per week, progressie per oefening.
7. **Lichaam**: lichaamsgewicht bijhouden + omtrekmaten (biceps, onderarm, bovenbeen, kuit … **links en
   rechts** apart).
8. **Data blijft bewaard** bij opnieuw openen.
9. **Telefoonvriendelijk** (primair gebruik op iPhone), testen kan op laptop via een link.
10. Strong als inspiratie, "maar dan beter en passend bij mij".

## Wat we beter doen dan Strong
- Gewichtsadvies per oefening met uitleg (↑ verhogen / = vasthouden / ↓ deload), automatisch ingevuld.
- Gratis charts (bij Strong PRO): e1RM-, max-gewicht- en volumeprogressie per oefening.
- "Volgende training"-suggestie (template die het langst geleden is).
- Weekstrip op het startscherm (welke dagen getraind, doel per week, streak).
- Lichaamsmaten links/rechts met verschil t.o.v. vorige meting.
- Records (PR's) automatisch gedetecteerd na elke training.

## Gamification (okt 2026)
Hele app in Pokémon FireRed-stijl. Elke spiergroep heeft een eigen origineel monster dat EXP krijgt voor
sets, gehaalde oefeningen, trainingen, PR's en het weekdoel, levelt en evolueert op Lv16/36.
Details: GAME_DESIGN.md.

## Schermen (tabbar)
| Tab | Inhoud |
|---|---|
| Team (was Profiel) | Trainerkaart + party van 6 monsters, stats, trainingen per week (chart + weekdoel), progressie per oefening, records, instellingen |
| Geschiedenis | Afgeronde trainingen per maand, detail, opslaan als template, verwijderen |
| Training | Weekstrip, lege training starten, templates (preview → starten / bewerken) |
| Oefeningen | Bibliotheek + eigen oefeningen, detail met chart, records en volgend advies |
| Lichaam | Lichaamsgewicht (chart + log), omtrekmaten L/R (tabel, chart, historie) |

Actieve training: full-screen, klok, sets afvinken, rusttimer-balk (−15/+15/overslaan),
warming-up sets (tik op setnummer), oefening toevoegen/verplaatsen/verwijderen, afronden met
samenvatting en optie om het template bij te werken. Een lopende training overleeft herladen.

## Status
- v0.1 (24 okt 2026): alle bovenstaande features werken lokaal (localStorage). Nog geen cloud-sync.

## Voeding (tab Lichaam → Voeding)
Eten loggen per dag in Ontbijt/Lunch/Diner/Snacks: barcode scannen (camera) of intypen, zoeken in Open Food Facts,
Recent/Mijn producten, zelf een product toevoegen. Dagtotaal vs. doel (kcal, eiwit, koolhydraten, vet) met trainerstip,
kopieer een maaltijd van gisteren. Doel instellen (lichaamsgegevens + aankomen/houden/afvallen) en een wekelijks slim
caloriedoel op basis van inname en gewichtstrend. Foto-herkenning met AI is bewust (nog) niet gebouwd.

Vaste maaltijden: een maaltijdblok met 2+ producten opslaan ("Opslaan als vaste maaltijd") en op de toevoegpagina met
één tik helemaal toevoegen. Eiwitdoel gehaald = +10 EXP. voor het hele team, en een Eiwit-badge voor 7 dagen op rij.

BMI-kaart (Lichaam → Gewicht & maten): laatste weging / lengte² (`profile.body.heightCm`, ook in te vullen via "Lengte"), WHO-schaal
(18,5 · 25 · 30) en taille/lengte-ratio als er een taillemeting is (< 0,5 = gezond). Met uitleg dat BMI spieren niet van vet onderscheidt.
