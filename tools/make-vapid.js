// Generates the Web Push (VAPID) key pair + a cron secret, once.
// Writes: .env (VAPID_PUBLIC_KEY for the browser config), supabase/functions/.env (Edge Function secrets)
// and supabase/push_secrets.local.sql (Vault secrets for the cron job). All three are gitignored.
// Usage: node tools/make-vapid.js   (refuses to overwrite existing keys; pass --force to rotate)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const envPath = path.join(root, '.env');
const fnEnvPath = path.join(root, 'supabase', 'functions', '.env');
const sqlPath = path.join(root, 'supabase', 'push_secrets.local.sql');

const env = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
if (/^VAPID_PUBLIC_KEY=/m.test(env) && !process.argv.includes('--force')) {
  console.error('VAPID-sleutels bestaan al in .env. Gebruik --force om nieuwe te maken (bestaande abonnementen werken dan niet meer).');
  process.exit(1);
}
const url = (env.match(/^SUPABASE_URL=(.*)$/m)?.[1] || '').trim().replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
if (!url) { console.error('SUPABASE_URL ontbreekt in .env'); process.exit(1); }

const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const pubJwk = publicKey.export({ format: 'jwk' });
const privJwk = privateKey.export({ format: 'jwk' });
const b64u = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64u = (s) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
// Uncompressed EC point: 0x04 || X || Y (65 bytes) — what PushManager.subscribe expects.
const vapidPublic = b64u(Buffer.concat([Buffer.from([4]), fromB64u(pubJwk.x), fromB64u(pubJwk.y)]));
const vapidPrivate = privJwk.d;
const cronSecret = b64u(crypto.randomBytes(32));
const fnUrl = `${url}/functions/v1/send-rest-push`;

const cleaned = env.replace(/^VAPID_PUBLIC_KEY=.*\r?\n?/m, '').replace(/\s*$/, '\n');
fs.writeFileSync(envPath, `${cleaned}\n# Web Push (gegenereerd door tools/make-vapid.js). De public key is openbaar.\nVAPID_PUBLIC_KEY=${vapidPublic}\n`);

fs.mkdirSync(path.dirname(fnEnvPath), { recursive: true });
fs.writeFileSync(fnEnvPath, [
  '# Edge Function secrets — upload met: npx supabase secrets set --env-file supabase/functions/.env --project-ref <ref>',
  `VAPID_PUBLIC_KEY=${vapidPublic}`,
  `VAPID_PRIVATE_KEY=${vapidPrivate}`,
  'VAPID_SUBJECT=https://mouggaali.github.io/Trainer/',
  `CRON_SECRET=${cronSecret}`,
  '',
].join('\n'));

fs.writeFileSync(sqlPath, `-- GEHEIM — niet delen of committen. Plak in Supabase → SQL Editor en klik Run (eenmalig, ná push.sql).
select vault.create_secret('${fnUrl}', 'rest_push_url', 'URL van de send-rest-push Edge Function');
select vault.create_secret('${cronSecret}', 'rest_push_secret', 'Geheime header voor de cron-aanroep');
`);

console.log('VAPID-sleutels en cron-geheim aangemaakt:');
console.log('  .env                              (VAPID_PUBLIC_KEY)');
console.log('  supabase/functions/.env           (Edge Function secrets)');
console.log('  supabase/push_secrets.local.sql   (Vault secrets voor de cron-job)');
