// Privacy statement. Reachable without logging in (link on the login screen) and from Settings.
import { icon } from '../ui.js';

export function renderPrivacy() {
  return `
    <header class="page-head">
      <button class="icon-btn" data-action="back" aria-label="Terug">${icon('chevronLeft')}</button>
      <h1 class="h-sm">Privacy</h1><span></span>
    </header>
    <section class="card prose">
      <h2>Wat bewaart Trainer?</h2>
      <ul>
        <li>Je <b>e-mailadres</b> en een versleuteld wachtwoord, om in te loggen.</li>
        <li>Wat je zelf invult: <b>trainingen</b>, schema's, notities, <b>voeding</b>, <b>lichaamsgewicht</b>,
          omtrekmaten en lichaamsgegevens (lengte, geboortejaar, geslacht). Dit zijn gezondheidsgegevens.</li>
        <li>Als je pushmeldingen aanzet: een technisch adres van je browser om de melding af te leveren.</li>
      </ul>
      <h2>Waarom?</h2>
      <p>Alleen om de app te laten werken: je data op je apparaten te tonen en te synchroniseren, advies te berekenen
        en je te laten weten wanneer je rust voorbij is. Er is geen reclame, er worden geen profielen gemaakt en er
        wordt niets verkocht of gedeeld.</p>
      <h2>Waar staat het?</h2>
      <p>Op je eigen apparaat en in een database bij <b>Supabase</b>, op servers in de <b>EU (Ierland)</b>. Beveiligd zo dat
        alleen jij je eigen gegevens kunt lezen. De app zelf wordt gehost via GitHub Pages.</p>
      <h2>Wat gaat naar anderen?</h2>
      <p>Als je een product <b>zoekt of een barcode scant</b>, gaat alleen die zoekterm of barcode naar
        <b>Open Food Facts</b> (een open voedingsdatabase) om de voedingswaarden op te halen. Je account of andere
        gegevens gaan daar niet heen.</p>
      <h2>Jouw rechten</h2>
      <ul>
        <li><b>Inzien en meenemen:</b> Instellingen → Exporteer back-up (JSON).</li>
        <li><b>Verwijderen:</b> Instellingen → Account verwijderen. Je account en alle data in de cloud worden
          direct en definitief gewist, ook de automatische back-ups.</li>
        <li><b>Uitloggen</b> wist de data van dat apparaat; in de cloud blijft het bewaard tot je je account verwijdert.</li>
      </ul>
      <h2>Vragen?</h2>
      <p>Neem contact op met de beheerder van deze app via de persoon die je de link heeft gestuurd.</p>
    </section>`;
}
