import { createClient } from '@supabase/supabase-js';

// ⚠️  NEVER hardcode credentials here.
// Values must be supplied via .env.local (local dev) or Vercel environment
// variables (production). The NEXT_PUBLIC_ prefix makes them available to
// the browser bundle — only the publishable anon key belongs there.
// The service-role key must NEVER be placed in a NEXT_PUBLIC_ variable.

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  throw new Error(
    'NEXT_PUBLIC_SUPABASE_URL is not set. Add it to .env.local or your Vercel environment variables.'
  );
}
if (!supabaseAnonKey) {
  throw new Error(
    'NEXT_PUBLIC_SUPABASE_ANON_KEY is not set. Add it to .env.local or your Vercel environment variables.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
