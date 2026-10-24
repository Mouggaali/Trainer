// Reads .env and writes js/config.js for the browser (the app has no build step,
// so the browser cannot read .env itself). Usage: node tools/build-config.js
// Falls back to environment variables (used by the GitHub Actions deploy, fed from repo secrets).
// js/config.js is gitignored: the key never ends up in the repository.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const envPath = path.join(root, '.env');
const env = { SUPABASE_URL: process.env.SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY, VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY };
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} else if (!env.SUPABASE_URL) {
  console.error('Geen .env gevonden. Kopieer .env.example naar .env en vul hem in.');
  process.exit(1);
}

const url = (env.SUPABASE_URL || '').replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
const key = env.SUPABASE_PUBLISHABLE_KEY || '';

if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)) {
  console.error(`SUPABASE_URL ziet er niet goed uit: "${url}"`);
  process.exit(1);
}
if (!key || key.startsWith('PLAK_HIER')) {
  console.error('Vul SUPABASE_PUBLISHABLE_KEY in .env in.');
  process.exit(1);
}
if (key.startsWith('sb_secret_') || /service_role/.test(Buffer.from(key.split('.')[1] || '', 'base64').toString())) {
  console.error('Dit is een SECRET/service_role key. Gebruik de publishable (of anon) key.');
  process.exit(1);
}

const out = `// Gegenereerd door tools/build-config.js uit .env — niet handmatig bewerken, niet committen.
// De publishable key is bedoeld om in de browser te staan; Row Level Security beschermt de data.
export const SUPABASE_URL = ${JSON.stringify(url)};
export const SUPABASE_PUBLISHABLE_KEY = ${JSON.stringify(key)};
export const VAPID_PUBLIC_KEY = ${JSON.stringify(env.VAPID_PUBLIC_KEY || '')};
`;
fs.writeFileSync(path.join(root, 'js', 'config.js'), out);
console.log(`js/config.js aangemaakt${env.VAPID_PUBLIC_KEY ? '' : ' (zonder VAPID_PUBLIC_KEY: pushmeldingen uit)'}.`);
