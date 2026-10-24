// Supabase Edge Function: sends a Web Push for every rest timer that is due.
// Called every 5 s by pg_cron (see supabase/push.sql) with the x-cron-secret header — not by browsers.
// Deploy: npx supabase functions deploy send-rest-push --project-ref <ref> --no-verify-jwt
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const env = (k: string) => Deno.env.get(k) ?? '';

webpush.setVapidDetails(env('VAPID_SUBJECT'), env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'));

const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false },
});

Deno.serve(async (req) => {
  const secret = env('CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) {
    return new Response('forbidden', { status: 403 });
  }

  // Claim due timers atomically: delete them and get the rows back.
  const { data: due, error } = await db
    .from('rest_timers')
    .delete()
    .lte('fire_at', new Date().toISOString())
    .select('user_id, title, body');
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!due?.length) return Response.json({ sent: 0 });

  let sent = 0;
  for (const t of due) {
    const { data: subs } = await db.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('user_id', t.user_id);
    const payload = JSON.stringify({ title: t.title, body: t.body, tag: 'rest', url: './#/active' });
    for (const s of subs ?? []) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
          { TTL: 60, urgency: 'high' },
        );
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await db.from('push_subscriptions').delete().eq('id', s.id); // expired
        else console.error('push failed', code, (e as Error).message);
      }
    }
  }
  return Response.json({ sent, timers: due.length });
});
