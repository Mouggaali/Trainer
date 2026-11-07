// Supabase Edge Function: the signed-in user deletes their own account.
// Deleting the auth user cascades (on delete cascade) to app_state, app_state_backups, push_subscriptions and rest_timers.
// Called from the app with the user's session (JWT is verified by Supabase before this code runs).
// Deploy: npx supabase functions deploy delete-account --project-ref <ref> --use-api
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const env = (k: string) => Deno.env.get(k) ?? '';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false },
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405, headers: CORS });

  // Who is calling? Only ever the user from the token — never an id from the request body.
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return Response.json({ error: 'not signed in' }, { status: 401, headers: CORS });

  const { error: delError } = await admin.auth.admin.deleteUser(data.user.id);
  if (delError) {
    console.error('delete failed', delError.message);
    return Response.json({ error: 'delete failed' }, { status: 500, headers: CORS });
  }
  return Response.json({ deleted: true }, { headers: CORS });
});
