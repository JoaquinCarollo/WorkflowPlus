import 'dotenv/config';
import { createApp } from './app.js';
import { assertTransactionalEmailProviderConfigured } from './domain/auth/employee-invitation.js';

assertTransactionalEmailProviderConfigured();
const supabaseUrl = process.env.SUPABASE_URL;
if (supabaseUrl) {
  try {
    console.info('[supabase] project host:', new URL(supabaseUrl).host);
  } catch {
    console.info('[supabase] project host: invalid URL');
  }
}
console.info(
  '[supabase] service role differs from anon:',
  Boolean(
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY !== process.env.SUPABASE_ANON_KEY,
  ),
);
const port = Number(process.env.PORT ?? 3001);
createApp().listen(port, () => console.info(`TaskFlow API listening on ${port}`));
