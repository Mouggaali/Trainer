# Database & hosting — stappenplan

## Huidige situatie (v0.1)
De app slaat alles op in de **browser van het apparaat** (`localStorage`). Dat betekent:
- ✅ Data blijft bewaard als je de app sluit en opnieuw opent.
- ⚠️ Data van je laptop en telefoon zijn **gescheiden** (elk apparaat zijn eigen opslag).
- ⚠️ Safari kan site-data wissen als je een website lang niet bezoekt. **Zet de app op je beginscherm**
  (Deel → "Zet op beginscherm") — dan geldt dat niet — en maak af en toe een export
  (Profiel → Instellingen → Exporteer back-up).

Voor synchronisatie tussen apparaten + veilige back-up in de cloud gebruiken we **Supabase**
(gratis tier, Postgres-database met login). Daarnaast moet de app **online gehost** worden zodat je
telefoon hem ook buiten je wifi kan openen.

---

## Wat ik van jou nodig heb

### Stap 1 — Supabase-project aanmaken (± 5 min)
1. Ga naar https://supabase.com en maak een gratis account (bv. inloggen met GitHub).
2. Klik **New project**. Naam: `trainer`. Kies een sterk database-wachtwoord (bewaar dat zelf,
   ik heb het **niet** nodig). Regio: **West EU (Frankfurt/Ireland)**.
3. Wacht tot het project klaar is.

### Stap 2 — Tabel aanmaken
1. Open in Supabase **SQL Editor → New query**.
2. Plak de inhoud van [`supabase/schema.sql`](../supabase/schema.sql) en klik **Run**.

### Stap 3 — Inloggen via e-mail aanzetten
1. **Authentication → Sign In / Providers → Email**: staat standaard aan. Laat "Confirm email" aan.
2. **Authentication → URL Configuration**: zet *Site URL* op het adres waar de app gehost wordt
   (zie stap 5) en voeg `http://localhost:5173` toe bij *Redirect URLs*.

### Stap 4 — Geef mij deze twee waarden
In **Project Settings → API** (of **Data API / API Keys**):
- **Project URL** — bv. `https://abcdxyz.supabase.co`
- **Publishable key** (heet bij oudere projecten **anon public key**)

Deze twee zijn bedoeld om in een web-app te staan (de beveiliging zit in de Row Level Security uit
`schema.sql`). Geef mij **nooit** de `service_role`/secret key of je database-wachtwoord.
Je kunt ze zelf in `js/config.js` zetten (dat bestand maak ik aan bij de sync-stap) of in de chat plakken.

### Stap 5 — Hosting (zodat je telefoon de app overal kan openen)
Makkelijkste optie: **Netlify** of **GitHub Pages** (beide gratis, geen build nodig).
- *Netlify Drop*: ga naar https://app.netlify.com/drop en sleep de projectmap erin → je krijgt een
  `https://….netlify.app` link.
- *GitHub Pages*: maak een GitHub-repo, push de code, Settings → Pages → branch `main` / root.
  Zeg het als je dit wilt, dan zet ik git + de repo voor je klaar.

Daarna op je iPhone: open de link in Safari → Deel → **Zet op beginscherm**.

---

## Status (24 okt 2026) — sync gebouwd
- Supabase-project: `https://holyuoqbiwhkszxkxuhh.supabase.co`, tabellen uit `schema.sql` bestaan.
- GitHub-repo: https://github.com/Mouggaali/Trainer → app op https://mouggaali.github.io/Trainer/
- **De key staat nooit in de repo.** Lokaal: `.env` (gitignored) → `node tools/build-config.js` → `js/config.js`
  (ook gitignored). Online: GitHub Actions (`.github/workflows/deploy.yml`) maakt `js/config.js` uit de
  repository secrets `SUPABASE_URL` en `SUPABASE_PUBLISHABLE_KEY`.
  Let op: de gepubliceerde website bevat de key wel (elke browser-app moet hem kunnen lezen); dat is
  waar publishable keys voor bedoeld zijn — Row Level Security beschermt de data.
- Sync-logica: `js/sync.js`. Lokaal blijft de bron; elke wijziging wordt na 1,5 s geüpload, bij openen /
  terugkeren naar de app wordt de cloudversie opgehaald. Conflict = nieuwste `modifiedAt` wint.
  Dagelijks een snapshot in `app_state_backups`.
- **Inloggen is verplicht**: zonder sessie toont de app alleen het inlogscherm (`js/views/login.js`,
  gate = `gateState()` in `js/sync.js`). Een opgeslagen sessie (`localStorage['trainer.auth']`) houdt de app
  open, ook offline. **Uitloggen** uploadt eerst alles (mislukt dat → niet uitloggen) en wist daarna de
  lokale data (`clearLocalData()`).
- Inlogscherm: **e-mail + wachtwoord** (Account aanmaken / Inloggen /
  Wachtwoord vergeten). Gekozen i.p.v. een e-mailcode omdat Supabase de mailtemplates op het gratis plan
  alleen laat aanpassen met een eigen SMTP-server.

## Nog door de gebruiker te doen in dashboards
1. GitHub → repo → Settings → Secrets and variables → Actions → **New repository secret**:
   `SUPABASE_URL` en `SUPABASE_PUBLISHABLE_KEY`.
2. GitHub → Settings → Pages → Source: **GitHub Actions**.
3. Supabase → Authentication → URL Configuration: Site URL `https://mouggaali.github.io/Trainer/`,
   Redirect URLs `https://mouggaali.github.io/Trainer/**` en `http://localhost:5173/**`.
4. ~~Mailtemplates aanpassen~~ — niet meer nodig (wachtwoord-login).
5. Optioneel, na je eerste login: Authentication → Sign In / Providers → "Allow new users to sign up" uit.

## Pushmeldingen bij einde rust (okt 2026)
Architectuur: app schrijft de lopende rust naar `public.rest_timers` (één rij per gebruiker, RLS) →
pg_cron (elke 5 s) roept alleen bij een verlopen timer de Edge Function `send-rest-push` aan (URL + geheim uit
Vault) → die stuurt Web Push (VAPID) naar `public.push_subscriptions` → `sw.js` toont de melding.
Is de app zichtbaar aan het eind van de rust, dan annuleert de app de melding 3 s vooraf (geen dubbele melding).

Eenmalige setup:
1. `node tools/make-vapid.js` → `.env` (VAPID_PUBLIC_KEY), `supabase/functions/.env` en
   `supabase/push_secrets.local.sql` (beide gitignored, geheim).
2. Supabase SQL Editor: `supabase/push.sql`, daarna `supabase/push_secrets.local.sql`.
3. `npx supabase login`, dan
   `npx supabase functions deploy send-rest-push --project-ref holyuoqbiwhkszxkxuhh --no-verify-jwt` en
   `npx supabase secrets set --env-file supabase/functions/.env --project-ref holyuoqbiwhkszxkxuhh`.
4. GitHub repo secret `VAPID_PUBLIC_KEY` (waarde uit `.env`).
5. iPhone: app vanaf beginscherm → Instellingen → Meldingen aanzetten.
